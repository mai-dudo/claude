-- Главный клиентский скрипт: строит интерфейс и показывает то, что решил сервер.

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared:WaitForChild("Config"))
local Wheel = require(Shared:WaitForChild("Wheel"))
local Ui = require(script:WaitForChild("Ui"))
local WheelView = require(script:WaitForChild("WheelView"))

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local GetState = Remotes:WaitForChild("GetState")
local SpinRemote = Remotes:WaitForChild("Spin")
local BuyUpgrade = Remotes:WaitForChild("BuyUpgrade")
local RebirthRemote = Remotes:WaitForChild("Rebirth")
local StateChanged = Remotes:WaitForChild("StateChanged")
local Announce = Remotes:WaitForChild("Announce")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local Colors = Ui.Colors

---------------------------------------------------------------------------------------------------
-- Состояние
---------------------------------------------------------------------------------------------------

-- Последнее, что прислал сервер. До загрузки — нули.
local state = { coins = 0, spins = 0, rebirths = 0, best = 0, upgrades = {}, counts = {}, passes = {} }
for id in Config.Upgrades do
	state.upgrades[id] = 0
end
for tier = 1, #Config.Segments do
	state.counts[tier] = 0
end

local loaded = false
local busy = false -- идёт крутка
local autoEnabled = false
local pendingReward = 0 -- выигрыш, который сервер уже начислил, но колесо ещё не показало
local shownCoins = 0 -- число на экране, плавно догоняет настоящее
local targetCoins = 0

local refresh -- объявлена ниже

local function levelOf(id: string): number
	return state.upgrades[id] or 0
end

local function hasAuto(): boolean
	return levelOf("auto") > 0 or state.passes.autoSpin == true
end

local function getLuck(): number
	return Wheel.getLuck(levelOf("luck"), state.passes.doubleLuck == true)
end

local function getMultiplier(): number
	return Wheel.getCoinMultiplier(levelOf("coins"), state.rebirths, state.passes.doubleCoins == true)
end

local function rewardFor(tier: number): number
	return Wheel.getReward(tier, levelOf("coins"), state.rebirths, state.passes.doubleCoins == true)
end

-- 1.50 -> "1.5", 2.00 -> "2"
local function trimNumber(value: number): string
	local text = string.format("%.2f", value)
	text = string.gsub(text, "%.?0+$", "")
	return text
end

---------------------------------------------------------------------------------------------------
-- Звуки
---------------------------------------------------------------------------------------------------

local sounds = {}
for name, id in Config.Sounds do
	if id ~= 0 then
		sounds[name] = Ui.create("Sound", {
			Name = "Spin_" .. name,
			SoundId = "rbxassetid://" .. id,
			Volume = 0.6,
			Parent = SoundService,
		})
	end
end

local function playSound(name: string)
	local sound = sounds[name]
	if sound then
		sound:Play()
	end
end

---------------------------------------------------------------------------------------------------
-- Каркас интерфейса
---------------------------------------------------------------------------------------------------

local screen = Ui.create("ScreenGui", {
	Name = "SpinGui",
	ResetOnSpawn = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	DisplayOrder = 5,
	Parent = playerGui,
})

-- Верх: монеты и строка с множителями.
local topBar = Ui.create("Frame", {
	Name = "TopBar",
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.fromScale(0.5, 0.012),
	Size = UDim2.fromScale(0.6, 0.13),
	BackgroundTransparency = 1,
	Parent = screen,
}, {
	Ui.create("UIListLayout", {
		FillDirection = Enum.FillDirection.Vertical,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Padding = UDim.new(0, 3),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}),
})

local coinsPill = Ui.create("Frame", {
	Name = "Coins",
	LayoutOrder = 1,
	Size = UDim2.fromScale(0.4, 0.55),
	BackgroundColor3 = Colors.panel,
	BorderSizePixel = 0,
	Parent = topBar,
}, {
	Ui.corner(UDim.new(0.5, 0)),
	Ui.stroke(Colors.gold, 2),
	Ui.sizeLimit(Vector2.new(170, 32), Vector2.new(320, 54)),
})

Ui.create("Frame", {
	Name = "CoinIcon",
	AnchorPoint = Vector2.new(0, 0.5),
	Position = UDim2.new(0, 8, 0.5, 0),
	Size = UDim2.fromScale(0.62, 0.62),
	SizeConstraint = Enum.SizeConstraint.RelativeYY,
	BackgroundColor3 = Colors.gold,
	BorderSizePixel = 0,
	Parent = coinsPill,
}, { Ui.corner(UDim.new(0.5, 0)) })

local coinsLabel = Ui.label({
	Name = "Amount",
	Position = UDim2.fromScale(0.2, 0.12),
	Size = UDim2.fromScale(0.74, 0.76),
	Font = Enum.Font.GothamBlack,
	Text = "0",
	TextColor3 = Colors.gold,
	TextXAlignment = Enum.TextXAlignment.Left,
	Parent = coinsPill,
}, 34)

local statsLabel = Ui.label({
	Name = "Stats",
	LayoutOrder = 2,
	Size = UDim2.fromScale(1, 0.24),
	Text = "",
	TextColor3 = Colors.textDim,
	Parent = topBar,
}, 16)
Ui.sizeLimit(Vector2.new(0, 12), nil).Parent = statsLabel

-- Центр: колесо и кнопки под ним. Размер считается от высоты экрана, чтобы влезать на телефон.
local center = Ui.create("Frame", {
	Name = "Center",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.565),
	Size = UDim2.fromScale(0.63, 0.8),
	SizeConstraint = Enum.SizeConstraint.RelativeYY,
	BackgroundTransparency = 1,
	Parent = screen,
}, { Ui.sizeLimit(nil, Vector2.new(460, 583)) })

local wheelHolder = Ui.create("Frame", {
	Name = "WheelHolder",
	Size = UDim2.fromScale(1, 1),
	SizeConstraint = Enum.SizeConstraint.RelativeXX,
	BackgroundTransparency = 1,
	Parent = center,
})

local wheel = WheelView.new(wheelHolder)

local spinButton = Ui.button({
	Name = "Spin",
	AnchorPoint = Vector2.new(0, 1),
	Position = UDim2.fromScale(0, 1),
	Size = UDim2.fromScale(0.66, 0.15),
	BackgroundColor3 = Colors.disabled,
	Text = "Загрузка…",
	Parent = center,
}, 38)

local autoButton = Ui.button({
	Name = "Auto",
	AnchorPoint = Vector2.new(1, 1),
	Position = UDim2.fromScale(1, 1),
	Size = UDim2.fromScale(0.31, 0.15),
	BackgroundColor3 = Colors.row,
	Text = "АВТО",
	Parent = center,
}, 20)

-- Табличка с выигрышем поверх колеса.
local resultStroke = Ui.stroke(Colors.gold, 3)
local resultScale = Ui.create("UIScale", { Scale = 1 })
local resultPopup = Ui.create("Frame", {
	Name = "Result",
	AnchorPoint = Vector2.new(0.5, 0.5),
	Position = UDim2.fromScale(0.5, 0.5),
	Size = UDim2.fromScale(0.86, 0.34),
	BackgroundColor3 = Colors.background,
	BackgroundTransparency = 0.08,
	BorderSizePixel = 0,
	Visible = false,
	ZIndex = 10,
	Parent = wheelHolder,
}, { Ui.corner(16), resultStroke, resultScale })

local resultName = Ui.label({
	Position = UDim2.fromScale(0.05, 0.08),
	Size = UDim2.fromScale(0.9, 0.36),
	Text = "",
	Parent = resultPopup,
}, 34)

local resultAmount = Ui.label({
	Position = UDim2.fromScale(0.05, 0.46),
	Size = UDim2.fromScale(0.9, 0.46),
	Font = Enum.Font.GothamBlack,
	Text = "",
	TextColor3 = Colors.gold,
	Parent = resultPopup,
}, 54)

local resultToken = 0

local function hideResult()
	resultToken += 1
	resultPopup.Visible = false
end

local function showResult(tier: number, reward: number)
	local segment = Config.Segments[tier]
	local accent = Color3.fromHex(segment.accent)

	resultToken += 1
	local token = resultToken

	resultName.Text = segment.name
	resultName.TextColor3 = accent
	resultAmount.Text = "+" .. Wheel.formatNumber(reward)
	resultStroke.Color = accent
	resultScale.Scale = 0.6
	resultPopup.Visible = true
	TweenService:Create(
		resultScale,
		TweenInfo.new(0.25, Enum.EasingStyle.Back, Enum.EasingDirection.Out),
		{ Scale = 1 }
	):Play()
	playSound(if segment.announce then "rare" else "win")

	task.delay(1.6, function()
		if resultToken == token then
			resultPopup.Visible = false
		end
	end)
end

-- Слева: кнопки меню.
local menu = Ui.create("Frame", {
	Name = "Menu",
	AnchorPoint = Vector2.new(0, 0.5),
	Position = UDim2.fromScale(0.012, 0.46),
	Size = UDim2.fromScale(0.13, 0.26),
	BackgroundTransparency = 1,
	Parent = screen,
}, {
	Ui.sizeLimit(Vector2.new(112, 110), Vector2.new(190, 170)),
	Ui.create("UIListLayout", {
		FillDirection = Enum.FillDirection.Vertical,
		Padding = UDim.new(0.06, 0),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}),
})

local upgradesButton = Ui.button({
	Name = "Upgrades",
	LayoutOrder = 1,
	Size = UDim2.fromScale(1, 0.29),
	BackgroundColor3 = Colors.gold,
	Text = "Улучшения",
	TextColor3 = Colors.goldDark,
	Parent = menu,
}, 20)

local oddsButton = Ui.button({
	Name = "Odds",
	LayoutOrder = 2,
	Size = UDim2.fromScale(1, 0.29),
	BackgroundColor3 = Colors.row,
	Text = "Шансы",
	Parent = menu,
}, 20)

local hideButton = Ui.button({
	Name = "Hide",
	LayoutOrder = 3,
	Size = UDim2.fromScale(1, 0.29),
	BackgroundColor3 = Colors.row,
	Text = "Скрыть колесо",
	Parent = menu,
}, 20)

-- Справа: объявления о редких выигрышах.
local toasts = Ui.create("Frame", {
	Name = "Toasts",
	AnchorPoint = Vector2.new(1, 0.5),
	Position = UDim2.fromScale(0.99, 0.5),
	Size = UDim2.fromScale(0.22, 0.4),
	BackgroundTransparency = 1,
	Parent = screen,
}, {
	Ui.sizeLimit(Vector2.new(170, 0), Vector2.new(300, 400)),
	Ui.create("UIListLayout", {
		FillDirection = Enum.FillDirection.Vertical,
		Padding = UDim.new(0, 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
		VerticalAlignment = Enum.VerticalAlignment.Bottom,
	}),
})

local toastOrder = 0

local function showToast(text: string, color: Color3, duration: number?)
	toastOrder += 1
	local toast = Ui.label({
		LayoutOrder = toastOrder,
		Size = UDim2.new(1, 0, 0, 52),
		BackgroundColor3 = Colors.background,
		BackgroundTransparency = 0.15,
		Text = text,
		TextColor3 = color,
		Parent = toasts,
	}, 15)
	Ui.corner(10).Parent = toast
	Ui.create("UIPadding", {
		PaddingLeft = UDim.new(0, 8),
		PaddingRight = UDim.new(0, 8),
		PaddingTop = UDim.new(0, 4),
		PaddingBottom = UDim.new(0, 4),
		Parent = toast,
	})
	task.delay(duration or 6, function()
		toast:Destroy()
	end)
end

---------------------------------------------------------------------------------------------------
-- Панели
---------------------------------------------------------------------------------------------------

local openPanel = nil

local function closePanel()
	if openPanel then
		openPanel.Visible = false
		openPanel = nil
	end
end

local function togglePanel(panel)
	local wasOpen = openPanel == panel
	closePanel()
	if not wasOpen then
		panel.Visible = true
		openPanel = panel
	end
end

-- Окно с заголовком, крестиком и прокручиваемым списком.
local function makePanel(name: string, title: string)
	local panel = Ui.create("Frame", {
		Name = name,
		Active = true, -- не пропускает нажатия на то, что под окном
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.565),
		Size = UDim2.fromScale(0.5, 0.84),
		BackgroundColor3 = Colors.panel,
		BorderSizePixel = 0,
		Visible = false,
		ZIndex = 20,
		Parent = screen,
	}, {
		Ui.corner(16),
		Ui.stroke(Colors.gold, 2),
		Ui.sizeLimit(Vector2.new(300, 230), Vector2.new(520, 620)),
	})

	Ui.label({
		Name = "Title",
		Position = UDim2.new(0, 16, 0, 8),
		Size = UDim2.new(1, -76, 0, 36),
		Font = Enum.Font.GothamBlack,
		Text = title,
		TextColor3 = Colors.gold,
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = panel,
	}, 26)

	local close = Ui.button({
		Name = "Close",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -10, 0, 8),
		Size = UDim2.fromOffset(36, 36),
		BackgroundColor3 = Colors.red,
		Text = "X",
		Parent = panel,
	}, 22)
	close.Activated:Connect(closePanel)

	local list = Ui.create("ScrollingFrame", {
		Name = "List",
		Position = UDim2.new(0, 12, 0, 52),
		Size = UDim2.new(1, -24, 1, -64),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		CanvasSize = UDim2.new(0, 0, 0, 0),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ScrollBarThickness = 6,
		ScrollingDirection = Enum.ScrollingDirection.Y,
		Parent = panel,
	}, {
		Ui.create("UIListLayout", {
			FillDirection = Enum.FillDirection.Vertical,
			Padding = UDim.new(0, 8),
			SortOrder = Enum.SortOrder.LayoutOrder,
		}),
	})

	return panel, list
end

-- Строка списка: название, пояснение и кнопка справа.
local function makeRow(list: Instance, order: number)
	local frame = Ui.create("Frame", {
		LayoutOrder = order,
		Size = UDim2.new(1, -10, 0, 72),
		BackgroundColor3 = Colors.row,
		BorderSizePixel = 0,
		Parent = list,
	}, { Ui.corner(10) })

	local title = Ui.label({
		Name = "Title",
		Position = UDim2.new(0, 12, 0, 6),
		Size = UDim2.new(0.64, -12, 0, 24),
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = frame,
	}, 19)

	local detail = Ui.label({
		Name = "Detail",
		Position = UDim2.new(0, 12, 0, 31),
		Size = UDim2.new(0.64, -12, 0, 35),
		Font = Enum.Font.GothamMedium,
		Text = "",
		TextColor3 = Colors.textDim,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		Parent = frame,
	}, 14)

	local button = Ui.button({
		Name = "Action",
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -10, 0.5, 0),
		Size = UDim2.new(0.34, -10, 0, 46),
		Text = "",
		Parent = frame,
	}, 18)

	return { frame = frame, title = title, detail = detail, button = button }
end

local function setButton(button, text: string, color: Color3, textColor: Color3?)
	button.Text = text
	button.BackgroundColor3 = color
	button.TextColor3 = textColor or Colors.text
end

-- Улучшения ----------------------------------------------------------------------------------------

local upgradesPanel, upgradesList = makePanel("UpgradesPanel", "Улучшения")

local requestInFlight = false

-- Отправляет запрос на сервер и применяет новое состояние. Второй запрос не уйдёт, пока не вернулся первый.
local function request(remote, ...): boolean
	if requestInFlight or not loaded then
		return false
	end
	requestInFlight = true
	local arguments = table.pack(...)
	local ok, result = pcall(function()
		return remote:InvokeServer(table.unpack(arguments, 1, arguments.n))
	end)
	requestInFlight = false

	if ok and typeof(result) == "table" and result.ok and typeof(result.state) == "table" then
		state = result.state
		refresh()
		return true
	end
	return false
end

local function effectText(id: string, level: number): string
	if id == "coins" then
		return "x" .. trimNumber(1 + Config.CoinsPerLevel * level)
	elseif id == "luck" then
		return "x" .. trimNumber(1 + Config.LuckPerLevel * level)
	elseif id == "speed" then
		return string.format("%.1f с", Wheel.getSpinTime(level))
	end
	return ""
end

local upgradeRows = {}
for order, id in Config.UpgradeOrder do
	local row = makeRow(upgradesList, order)
	upgradeRows[id] = row
	row.button.Activated:Connect(function()
		if request(BuyUpgrade, id) then
			playSound("buy")
		end
	end)
end

local rebirthRow = makeRow(upgradesList, 50)
local rebirthArmedAt = 0

rebirthRow.button.Activated:Connect(function()
	if targetCoins < Wheel.getRebirthCost(state.rebirths) then
		return
	end
	-- Перерождение сбрасывает прогресс, поэтому просим нажать дважды.
	if os.clock() - rebirthArmedAt > 4 then
		rebirthArmedAt = os.clock()
		refresh()
		task.delay(4.1, function()
			refresh()
		end)
		return
	end
	rebirthArmedAt = 0
	if request(RebirthRemote) then
		playSound("rare")
	else
		refresh()
	end
end)

local passRows = {}
for order, key in Config.GamePassOrder do
	local pass = Config.GamePasses[key]
	if pass and pass.id ~= 0 then
		local row = makeRow(upgradesList, 100 + order)
		row.title.Text = pass.name
		row.detail.Text = pass.description
		passRows[key] = row
		row.button.Activated:Connect(function()
			if state.passes[key] ~= true then
				MarketplaceService:PromptGamePassPurchase(player, pass.id)
			end
		end)
	end
end

local function refreshUpgrades()
	for _, id in Config.UpgradeOrder do
		local upgrade = Config.Upgrades[id]
		local row = upgradeRows[id]
		local level = levelOf(id)
		local cost = Wheel.getUpgradeCost(id, level)
		local owned = id == "auto" and hasAuto()

		if id == "auto" then
			row.title.Text = upgrade.name
			row.detail.Text = upgrade.description
		else
			row.title.Text = `{upgrade.name} · ур. {level}/{upgrade.maxLevel}`
			if cost then
				row.detail.Text = `{upgrade.description}\n{effectText(id, level)} → {effectText(id, level + 1)}`
			else
				row.detail.Text = `{upgrade.description}\n{effectText(id, level)}`
			end
		end

		if owned then
			setButton(row.button, "Куплено", Colors.disabled)
		elseif not cost then
			setButton(row.button, "МАКС", Colors.disabled)
		elseif targetCoins >= cost then
			setButton(row.button, Wheel.formatNumber(cost), Colors.green)
		else
			setButton(row.button, Wheel.formatNumber(cost), Colors.disabled)
		end
	end

	local rebirthCost = Wheel.getRebirthCost(state.rebirths)
	local bonusNow = 1 + Config.RebirthBonus * state.rebirths
	local bonusNext = 1 + Config.RebirthBonus * (state.rebirths + 1)
	rebirthRow.title.Text = `Перерождение · {state.rebirths}`
	rebirthRow.detail.Text =
		`Сбросит монеты и улучшения.\nНавсегда: монеты x{trimNumber(bonusNow)} → x{trimNumber(bonusNext)}`
	if targetCoins < rebirthCost then
		setButton(rebirthRow.button, Wheel.formatNumber(rebirthCost), Colors.disabled)
	elseif os.clock() - rebirthArmedAt <= 4 then
		setButton(rebirthRow.button, "Точно?", Colors.red)
	else
		setButton(rebirthRow.button, Wheel.formatNumber(rebirthCost), Colors.gold, Colors.goldDark)
	end

	for key, row in passRows do
		if state.passes[key] == true then
			setButton(row.button, "Куплено", Colors.disabled)
		else
			setButton(row.button, "Купить", Colors.gold, Colors.goldDark)
		end
	end
end

-- Шансы --------------------------------------------------------------------------------------------

local oddsPanel, oddsList = makePanel("OddsPanel", "Шансы")

local oddsNote = Ui.label({
	LayoutOrder = 0,
	Size = UDim2.new(1, -10, 0, 20),
	Font = Enum.Font.GothamMedium,
	Text = "",
	TextColor3 = Colors.textDim,
	TextXAlignment = Enum.TextXAlignment.Left,
	Parent = oddsList,
}, 14)

local oddsRows = {}
for tier, segment in Config.Segments do
	local frame = Ui.create("Frame", {
		LayoutOrder = tier,
		Size = UDim2.new(1, -10, 0, 48),
		BackgroundColor3 = Colors.row,
		BorderSizePixel = 0,
		Parent = oddsList,
	}, { Ui.corner(10) })

	Ui.create("Frame", {
		Name = "Swatch",
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0, 10, 0.5, 0),
		Size = UDim2.fromOffset(26, 26),
		BackgroundColor3 = Color3.fromHex(segment.color),
		BorderSizePixel = 0,
		Parent = frame,
	}, { Ui.corner(UDim.new(0.5, 0)), Ui.stroke(Color3.fromHex(segment.accent), 2) })

	Ui.label({
		Name = "TierName",
		Position = UDim2.new(0, 46, 0, 5),
		Size = UDim2.new(0.44, -46, 0, 21),
		Text = segment.name,
		TextColor3 = Color3.fromHex(segment.accent),
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = frame,
	}, 17)

	local count = Ui.label({
		Name = "Count",
		Position = UDim2.new(0, 46, 0, 27),
		Size = UDim2.new(0.44, -46, 0, 15),
		Font = Enum.Font.GothamMedium,
		Text = "",
		TextColor3 = Colors.textDim,
		TextXAlignment = Enum.TextXAlignment.Left,
		Parent = frame,
	}, 12)

	local chance = Ui.label({
		Name = "Chance",
		Position = UDim2.new(0.44, 0, 0, 8),
		Size = UDim2.new(0.28, 0, 0, 32),
		Text = "",
		Parent = frame,
	}, 16)

	local reward = Ui.label({
		Name = "Reward",
		Position = UDim2.new(0.72, 0, 0, 8),
		Size = UDim2.new(0.28, -10, 0, 32),
		Text = "",
		TextColor3 = Colors.gold,
		TextXAlignment = Enum.TextXAlignment.Right,
		Parent = frame,
	}, 17)

	oddsRows[tier] = { count = count, chance = chance, reward = reward }
end

local function refreshOdds()
	local luck = getLuck()
	local odds = Wheel.getOdds(luck)
	oddsNote.Text = `С вашей удачей x{trimNumber(luck)}. Сектора на колесе одного размера, шансы разные.`
	for tier, row in oddsRows do
		row.chance.Text = Wheel.formatOdds(odds[tier])
		row.reward.Text = "+" .. Wheel.formatNumber(rewardFor(tier))
		row.count.Text = "выпадал: " .. Wheel.formatNumber(state.counts[tier] or 0)
	end
end

---------------------------------------------------------------------------------------------------
-- Обновление всего интерфейса по состоянию
---------------------------------------------------------------------------------------------------

function refresh()
	targetCoins = math.max(state.coins - pendingReward, 0)

	statsLabel.Text = `Удача x{trimNumber(getLuck())} · Монеты x{trimNumber(getMultiplier())} · Круток: {Wheel.formatNumber(
		state.spins
	)}`

	wheel:setRewardText(function(tier: number)
		return Wheel.formatNumber(rewardFor(tier))
	end)

	if not loaded then
		setButton(spinButton, "Загрузка…", Colors.disabled)
	elseif busy then
		setButton(spinButton, "Крутим…", Colors.disabled)
	else
		setButton(spinButton, "КРУТИТЬ", Colors.green)
	end

	if not hasAuto() then
		setButton(autoButton, "АВТО\nкупить", Colors.row)
	elseif autoEnabled then
		setButton(autoButton, "АВТО\nвкл", Colors.green)
	else
		setButton(autoButton, "АВТО\nвыкл", Colors.row)
	end

	refreshUpgrades()
	refreshOdds()
end

---------------------------------------------------------------------------------------------------
-- Крутка
---------------------------------------------------------------------------------------------------

local function spinOnce()
	hideResult()

	local ok, result = pcall(function()
		return SpinRemote:InvokeServer()
	end)
	if not ok or typeof(result) ~= "table" or not result.ok then
		-- Сервер отказал (перезарядка или данные ещё грузятся) — чуть ждём и отдаём кнопку.
		task.wait(0.5)
		return
	end

	-- Сервер уже начислил выигрыш, но показываем его только после остановки колеса.
	state = result.state
	pendingReward = result.reward
	refresh()

	playSound("spin")
	wheel:spinTo(result.tier, Wheel.getSpinTime(levelOf("speed")))

	pendingReward = 0
	showResult(result.tier, result.reward)
	refresh()
end

local function startSpinning()
	if busy or not loaded then
		return
	end
	busy = true
	refresh()

	while true do
		spinOnce()
		if not (autoEnabled and hasAuto()) then
			break
		end
		task.wait(0.45) -- пауза, чтобы успеть увидеть выигрыш
		if not (autoEnabled and hasAuto()) then
			break
		end
	end

	busy = false
	refresh()
end

---------------------------------------------------------------------------------------------------
-- Кнопки и события
---------------------------------------------------------------------------------------------------

spinButton.Activated:Connect(startSpinning)

autoButton.Activated:Connect(function()
	if not hasAuto() then
		if openPanel ~= upgradesPanel then
			togglePanel(upgradesPanel)
		end
		return
	end
	autoEnabled = not autoEnabled
	refresh()
	if autoEnabled then
		startSpinning()
	end
end)

upgradesButton.Activated:Connect(function()
	togglePanel(upgradesPanel)
end)

oddsButton.Activated:Connect(function()
	togglePanel(oddsPanel)
end)

hideButton.Activated:Connect(function()
	center.Visible = not center.Visible
	hideButton.Text = if center.Visible then "Скрыть колесо" else "Показать колесо"
end)

-- Клавиша E крутит колесо.
UserInputService.InputBegan:Connect(function(input: InputObject, processed: boolean)
	if not processed and input.KeyCode == Enum.KeyCode.E then
		startSpinning()
	end
end)

-- Принимает состояние от сервера. В первый раз предупреждает, если сохранения недоступны
-- (так бывает в Studio без доступа к API или при сбое DataStore).
local function applyState(newState)
	local first = not loaded
	state = newState
	loaded = true
	refresh()
	if first and newState.canSave == false then
		showToast("Сохранения сейчас недоступны: прогресс этой игры не сохранится.", Colors.red, 12)
	end
end

StateChanged.OnClientEvent:Connect(function(newState)
	if typeof(newState) == "table" then
		applyState(newState)
	end
end)

Announce.OnClientEvent:Connect(function(name, tier, reward)
	local segment = Config.Segments[tier]
	if typeof(name) ~= "string" or typeof(reward) ~= "number" or not segment then
		return
	end
	showToast(
		`{name} выбил «{segment.name}»: +{Wheel.formatNumber(reward)} монет!`,
		Color3.fromHex(segment.accent)
	)
end)

-- Число монет плавно догоняет настоящее значение.
RunService.RenderStepped:Connect(function(deltaTime: number)
	if shownCoins == targetCoins then
		return
	end
	local difference = targetCoins - shownCoins
	if math.abs(difference) < 1 then
		shownCoins = targetCoins
	else
		shownCoins += difference * math.min(1, deltaTime * 12)
	end
	coinsLabel.Text = Wheel.formatNumber(shownCoins)
end)

---------------------------------------------------------------------------------------------------
-- Большой экран в лобби
---------------------------------------------------------------------------------------------------

local bigWheel = nil

task.spawn(function()
	local lobby = workspace:WaitForChild("Lobby", 30)
	local screenPart = lobby and lobby:WaitForChild("WheelScreen", 30)
	if not screenPart then
		return
	end

	local surface = Ui.create("SurfaceGui", {
		Name = "BigWheel",
		Adornee = screenPart,
		Face = Enum.NormalId.Front,
		SizingMode = Enum.SurfaceGuiSizingMode.FixedSize,
		CanvasSize = Vector2.new(600, 600),
		LightInfluence = 0,
		ResetOnSpawn = false,
		ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
		Parent = playerGui,
	})

	local holder = Ui.create("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(0.9, 0.9),
		BackgroundTransparency = 1,
		Parent = surface,
	})

	local view = WheelView.new(holder)
	view:setRewardText(function(tier: number)
		return "x" .. Wheel.formatNumber(Config.Segments[tier].multiplier)
	end)
	bigWheel = view

	RunService.RenderStepped:Connect(function(deltaTime: number)
		view:rotate(deltaTime * 14)
	end)
end)

task.spawn(function()
	while true do
		task.wait(0.4)
		wheel:blink()
		if bigWheel then
			bigWheel:blink()
		end
	end
end)

---------------------------------------------------------------------------------------------------
-- Загрузка прогресса
---------------------------------------------------------------------------------------------------

refresh()

task.spawn(function()
	while not loaded do
		local ok, result = pcall(function()
			return GetState:InvokeServer()
		end)
		if ok and typeof(result) == "table" then
			if not loaded then
				applyState(result)
			end
			return
		end
		task.wait(1)
	end
end)
