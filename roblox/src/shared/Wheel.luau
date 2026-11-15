--!strict
-- Чистая логика колеса: шансы, награды, цены. Одна и та же на сервере и на клиенте,
-- поэтому игрок видит ровно те шансы, по которым сервер выбирает сектор.

local Config = require(script.Parent.Config)

local Wheel = {}

local SUFFIXES = { "", "K", "M", "B", "T", "Qa", "Qi" }

local function clampLevel(level: number, maxLevel: number): number
	return math.clamp(math.floor(level), 0, maxLevel)
end

-- Итоговая удача: 1 — базовая, больше — редкие сектора чаще.
function Wheel.getLuck(luckLevel: number, hasLuckPass: boolean): number
	local level = clampLevel(luckLevel, Config.Upgrades.luck.maxLevel)
	local luck = 1 + Config.LuckPerLevel * level
	if hasLuckPass then
		luck *= 2
	end
	return luck
end

-- Веса секторов с учётом удачи. Чем реже сектор, тем сильнее на него действует удача:
-- самый частый не меняется, самый редкий умножается на всю удачу.
function Wheel.getWeights(luck: number): { number }
	local count = #Config.Segments
	local weights = table.create(count)
	for tier, segment in Config.Segments do
		local exponent = if count > 1 then (tier - 1) / (count - 1) else 0
		weights[tier] = segment.weight * math.max(luck, 1) ^ exponent
	end
	return weights
end

-- Шансы секторов в долях от единицы.
function Wheel.getOdds(luck: number): { number }
	local weights = Wheel.getWeights(luck)
	local total = 0
	for _, weight in weights do
		total += weight
	end
	local odds = table.create(#weights)
	for tier, weight in weights do
		odds[tier] = weight / total
	end
	return odds
end

-- Выбор сектора. roll — случайное число от 0 до 1.
function Wheel.roll(luck: number, roll: number): number
	local odds = Wheel.getOdds(luck)
	local cursor = 0
	for tier, chance in odds do
		cursor += chance
		if roll < cursor then
			return tier
		end
	end
	return 1
end

function Wheel.getCoinMultiplier(coinsLevel: number, rebirths: number, hasCoinsPass: boolean): number
	local level = clampLevel(coinsLevel, Config.Upgrades.coins.maxLevel)
	local multiplier = (1 + Config.CoinsPerLevel * level) * (1 + Config.RebirthBonus * math.max(rebirths, 0))
	if hasCoinsPass then
		multiplier *= 2
	end
	return multiplier
end

function Wheel.getReward(tier: number, coinsLevel: number, rebirths: number, hasCoinsPass: boolean): number
	local segment = Config.Segments[tier]
	if not segment then
		return 0
	end
	local multiplier = Wheel.getCoinMultiplier(coinsLevel, rebirths, hasCoinsPass)
	return math.floor(Config.BaseReward * segment.multiplier * multiplier + 0.5)
end

function Wheel.getSpinTime(speedLevel: number): number
	local level = clampLevel(speedLevel, Config.Upgrades.speed.maxLevel)
	return math.max(Config.MinSpinTime, Config.BaseSpinTime - Config.SpinTimePerLevel * level)
end

-- Цена следующего уровня улучшения. nil — улучшение не существует или уже на максимуме.
function Wheel.getUpgradeCost(upgradeId: string, currentLevel: number): number?
	local upgrade = Config.Upgrades[upgradeId]
	if not upgrade or currentLevel >= upgrade.maxLevel then
		return nil
	end
	return math.floor(upgrade.baseCost * upgrade.costGrowth ^ math.max(currentLevel, 0) + 0.5)
end

function Wheel.getRebirthCost(rebirths: number): number
	return math.floor(Config.RebirthBaseCost * Config.RebirthCostGrowth ^ math.max(rebirths, 0) + 0.5)
end

-- На каком месте колеса (по часовой стрелке от указателя) стоит тир.
function Wheel.getWheelPosition(tier: number): number
	return table.find(Config.WheelOrder, tier) or 1
end

-- 1234 -> "1,234"; 12345 -> "12.3K"; 2500000 -> "2.5M"
function Wheel.formatNumber(value: number): string
	local amount = math.floor(math.max(value, 0) + 0.5)
	if amount < 10000 then
		local text = tostring(amount)
		if amount >= 1000 then
			text = string.sub(text, 1, -4) .. "," .. string.sub(text, -3)
		end
		return text
	end

	local index = 1
	local scaled = amount
	while scaled >= 1000 and index < #SUFFIXES do
		scaled /= 1000
		index += 1
	end

	-- Округляем вниз, чтобы не показать больше, чем есть. Крошечная добавка гасит ошибку
	-- дробной арифметики: без неё 2.05 превращается в 2.04.
	local text
	if scaled >= 100 then
		text = string.format("%d", math.floor(scaled + 1e-9))
	elseif scaled >= 10 then
		text = string.format("%.1f", math.floor(scaled * 10 + 1e-9) / 10)
	else
		text = string.format("%.2f", math.floor(scaled * 100 + 1e-9) / 100)
	end
	-- "12.0" -> "12", "1.50" -> "1.5"
	if string.find(text, ".", 1, true) then
		text = string.gsub(text, "0+$", "")
		text = string.gsub(text, "%.$", "")
	end
	return text .. SUFFIXES[index]
end

-- 0.45 -> "45%"; 0.012 -> "1.2%"; 0.0005 -> "1 из 2,000"
function Wheel.formatOdds(chance: number): string
	if chance <= 0 then
		return "0%"
	end
	if chance >= 0.01 then
		local percent = chance * 100
		if percent >= 10 then
			return string.format("%d%%", math.floor(percent + 0.5))
		end
		return string.format("%.1f%%", percent)
	end
	return "1 из " .. Wheel.formatNumber(math.floor(1 / chance + 0.5))
end

return Wheel
