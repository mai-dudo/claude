--!nocheck
-- Сквозная проверка игры без Studio: lune run tests/smoke [-- --passes]
-- Запускает сервер и клиент из собранного места и «играет»: крутит, покупает, перерождается, сохраняется.
-- Сначала соберите место: rojo build -o build/SpinAndWin.rbxlx

local process = require("@lune/process")
local roblox = require("@lune/roblox")

local Harness = require("./harness")

local PLACE = "build/SpinAndWin.rbxlx"
local withPasses = table.find(process.args, "--passes") ~= nil
local withoutStore = table.find(process.args, "--nostore") ~= nil

local checks = 0

local function stopOnFailures(stage)
	local failures = Harness.failures()
	if #failures > 0 then
		print(`\nОШИБКИ В СКРИПТАХ ИГРЫ ({stage}):`)
		for _, failure in failures do
			print(failure)
			print("")
		end
		process.exit(1)
	end
end

local function check(condition, message)
	checks += 1
	if not condition then
		stopOnFailures(message)
		print("ПРОВАЛ: " .. message)
		process.exit(1)
	end
end

local function equal(actual, expected, message)
	check(actual == expected, `{message}: ожидалось {tostring(expected)}, получено {tostring(actual)}`)
end

local function near(actual, expected, tolerance, message)
	check(
		math.abs(actual - expected) <= tolerance,
		`{message}: ожидалось около {expected}, получено {actual}`
	)
end

local function contains(text, part, message)
	check(string.find(text, part, 1, true) ~= nil, `{message}: в «{text}» нет «{part}»`)
end

local world = Harness.start(PLACE, {
	passIds = if withPasses then { doubleCoins = 111, doubleLuck = 222, autoSpin = 333 } else nil,
	noDataStore = withoutStore,
})
local game = world.game
local player = world.player
local workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Config = world.require(ReplicatedStorage.Shared.Config)
local Wheel = world.require(ReplicatedStorage.Shared.Wheel)

if withoutStore then
	-- Место не опубликовано: DataStore недоступен. Игра должна работать, просто без сохранений.
	print("Игра без DataStore")
	local server = game:GetService("ServerScriptService").Server
	world.run(server)
	Harness.advance(0.5)
	stopOnFailures("запуск сервера без DataStore")
	local data = world.require(server.PlayerData)
	local current = data.get(player)
	check(current ~= nil, "сессия открыта и без DataStore")
	equal(current.canSave, false, "сохранение выключено")

	world.run(game:GetService("StarterPlayer").StarterPlayerScripts.Client)
	Harness.advance(0.5)
	stopOnFailures("запуск клиента без DataStore")
	local screen = world.playerGui.SpinGui
	equal(screen.Center.Spin.Text, "КРУТИТЬ", "кнопка готова сразу, без долгого ожидания")
	local warned = false
	for _, toast in screen.Toasts:GetChildren() do
		if toast:IsA("TextLabel") and string.find(toast.Text, "не сохранится", 1, true) then
			warned = true
		end
	end
	check(warned, "игрок предупреждён, что прогресс не сохранится")

	Harness.fire(screen.Center.Spin, "Activated")
	Harness.advance(Config.BaseSpinTime + 0.2)
	equal(current.data.spins, 1, "крутка работает без DataStore")
	Harness.fire(Players, "PlayerRemoving", player)
	Harness.advance(0.1)
	for _, callback in world.closeCallbacks do
		Harness.spawn(callback)
	end
	Harness.advance(30)
	stopOnFailures("выход без DataStore")
	equal(next(world.stores), nil, "в DataStore ничего не записано")
	print(`\nВсе проверки пройдены: {checks} (без DataStore)`)
	process.exit(0)
end

---------------------------------------------------------------------------------------------------
print("1. Логика колеса")
---------------------------------------------------------------------------------------------------

do
	local totalWeight = 0
	for _, segment in Config.Segments do
		totalWeight += segment.weight
	end
	near(totalWeight, 100, 1e-9, "веса секторов в сумме дают 100%")
	equal(#Config.WheelOrder, #Config.Segments, "на колесе стоят все сектора")
	local seen = {}
	for _, tier in Config.WheelOrder do
		check(Config.Segments[tier] ~= nil and not seen[tier], "каждый тир стоит на колесе один раз")
		seen[tier] = true
	end

	local odds = Wheel.getOdds(1)
	local sum = 0
	for tier, chance in odds do
		sum += chance
		near(chance, Config.Segments[tier].weight / 100, 1e-9, `шанс тира {tier} при удаче 1 равен базовому`)
	end
	near(sum, 1, 1e-9, "шансы в сумме дают 1")

	equal(Wheel.roll(1, 0), 1, "бросок 0 — обычный сектор")
	equal(Wheel.roll(1, 0.4499), 1, "бросок чуть ниже 45% — обычный")
	equal(Wheel.roll(1, 0.4501), 2, "бросок чуть выше 45% — необычный")
	equal(Wheel.roll(1, 0.99949), 7, "бросок перед джекпотом — секретный")
	equal(Wheel.roll(1, 0.99951), 8, "последние 0.05% — джекпот")
	equal(Wheel.roll(1, 0.9999999), 8, "бросок у самой единицы — джекпот")

	local lucky = Wheel.getOdds(6)
	local luckySum = 0
	for _, chance in lucky do
		luckySum += chance
	end
	near(luckySum, 1, 1e-9, "шансы с удачей в сумме дают 1")
	check(lucky[1] < odds[1], "удача уменьшает шанс обычного сектора")
	for tier = 4, #lucky do
		check(lucky[tier] > odds[tier], `удача увеличивает шанс тира {tier}`)
	end
	check(lucky[8] / odds[8] > lucky[5] / odds[5], "на редкие тиры удача действует сильнее")

	-- Частоты на большом числе бросков совпадают с объявленными шансами.
	local counts = table.create(#odds, 0)
	local rolls = 200000
	for _ = 1, rolls do
		counts[Wheel.roll(1, math.random())] += 1
	end
	for tier = 1, 4 do
		near(counts[tier] / rolls, odds[tier], 0.006, `частота тира {tier} на {rolls} бросках`)
	end

	equal(Wheel.getReward(1, 0, 0, false), 10, "базовая награда")
	equal(Wheel.getReward(8, 0, 0, false), 250000, "джекпот без улучшений")
	equal(Wheel.getReward(1, 2, 0, false), 20, "два уровня монет удваивают награду")
	equal(Wheel.getReward(1, 2, 1, true), 80, "перерождение и пасс перемножаются")
	equal(Wheel.getReward(99, 0, 0, false), 0, "несуществующий тир ничего не даёт")

	equal(Wheel.getSpinTime(0), 4, "базовое время крутки")
	near(Wheel.getSpinTime(10), 1, 1e-9, "максимальная скорость")
	near(Wheel.getSpinTime(999), 1, 1e-9, "время не опускается ниже минимума")

	equal(Wheel.getUpgradeCost("coins", 0), 60, "цена первого уровня монет")
	equal(Wheel.getUpgradeCost("coins", 1), 78, "цена второго уровня монет")
	equal(Wheel.getUpgradeCost("coins", 50), nil, "на максимуме цены нет")
	equal(Wheel.getUpgradeCost("nope", 0), nil, "у неизвестного улучшения цены нет")
	equal(Wheel.getRebirthCost(0), 250000, "цена первого перерождения")
	equal(Wheel.getRebirthCost(2), 4000000, "цена третьего перерождения")
	equal(Wheel.getLuck(4, false), 2, "четыре уровня удачи дают x2")
	equal(Wheel.getLuck(4, true), 4, "пасс удваивает удачу")

	local formats = {
		{ 0, "0" },
		{ 999, "999" },
		{ 1234, "1,234" },
		{ 9999, "9,999" },
		{ 10000, "10K" },
		{ 12345, "12.3K" },
		{ 250000, "250K" },
		{ 1500000, "1.5M" },
		{ 2050000, "2.05M" },
		{ 999999999, "999M" },
		{ 1e15, "1Qa" },
		{ -5, "0" },
	}
	for _, case in formats do
		equal(Wheel.formatNumber(case[1]), case[2], `формат числа {case[1]}`)
	end
	equal(Wheel.formatOdds(0.45), "45%", "формат шанса 45%")
	equal(Wheel.formatOdds(0.035), "3.5%", "формат шанса 3.5%")
	equal(Wheel.formatOdds(0.0005), "1 из 2,000", "формат редкого шанса")
	equal(Wheel.formatOdds(0), "0%", "формат нулевого шанса")
end

---------------------------------------------------------------------------------------------------
print("2. Запуск сервера")
---------------------------------------------------------------------------------------------------

local serverScript = game:GetService("ServerScriptService").Server
world.run(serverScript)
Harness.advance(0.5)
stopOnFailures("запуск сервера")

local PlayerData = world.require(serverScript.PlayerData)
local session = PlayerData.get(player)
check(session ~= nil, "сессия игрока открыта")
equal(session.canSave, true, "сохранения доступны")

local lobby = workspace:FindFirstChild("Lobby")
check(lobby ~= nil, "лобби построено")
check(lobby:FindFirstChild("WheelScreen") ~= nil, "в лобби есть экран для колеса")
check(lobby:FindFirstChild("Stage") ~= nil, "в лобби есть сцена")
check(game:GetService("Lighting"):FindFirstChildOfClass("BloomEffect") ~= nil, "свечение включено")

local leaderstats = player:FindFirstChild("leaderstats")
check(leaderstats ~= nil, "таблица лидеров создана")
local coinsStat = leaderstats:FindFirstChild("Монеты")
check(coinsStat ~= nil and leaderstats:FindFirstChild("Ребёрты") ~= nil, "в таблице есть монеты и ребёрты")

local head = world.character.Head
local title = head:FindFirstChild("RarityTitle")
check(title ~= nil, "подпись над головой создана")
equal(title.Enabled, false, "пока ничего не выпало, подпись скрыта")

---------------------------------------------------------------------------------------------------
print("3. Запуск клиента")
---------------------------------------------------------------------------------------------------

local clientScript = game:GetService("StarterPlayer").StarterPlayerScripts.Client
world.run(clientScript)
Harness.advance(0.5)
stopOnFailures("запуск клиента")

local gui = world.playerGui:FindFirstChild("SpinGui")
check(gui ~= nil, "интерфейс создан")
local center = gui.Center
local spinButton = center.Spin
local autoButton = center.Auto
local disc = center.WheelHolder.Wheel.Disc
local resultPopup = center.WheelHolder.Result
local coinsLabel = gui.TopBar.Coins.Amount
local statsLabel = gui.TopBar.Stats
local upgradesPanel = gui.UpgradesPanel
local oddsPanel = gui.OddsPanel

equal(spinButton.Text, "КРУТИТЬ", "после загрузки кнопка готова")
contains(autoButton.Text, "купить", "авто-крутка сначала не куплена")
check(#disc:GetChildren() > 100, "колесо собрано из полосок")

local bigWheel = world.playerGui:FindFirstChild("BigWheel")
check(bigWheel ~= nil, "колесо на большом экране создано")
equal(bigWheel.Adornee, lobby.WheelScreen, "большое колесо висит на экране лобби")

local function click(button)
	Harness.fire(button, "Activated")
end

local function tierUnderPointer()
	local angle = (-disc.Rotation) % 360
	local position = math.floor(angle / (360 / #Config.WheelOrder)) + 1
	return Config.WheelOrder[position]
end

local function rowByOrder(list, order)
	for _, child in list:GetChildren() do
		if child:IsA("Frame") and child.LayoutOrder == order then
			return child
		end
	end
	return nil
end

local function settleCoins()
	world.fireRenderStepped(150)
end

---------------------------------------------------------------------------------------------------
print("4. Крутка")
---------------------------------------------------------------------------------------------------

do
	local countsBefore = table.clone(session.data.counts)
	click(spinButton)
	equal(spinButton.Text, "Крутим…", "кнопка блокируется на время крутки")
	equal(session.data.spins, 1, "сервер засчитал крутку")

	Harness.advance(Config.BaseSpinTime - 0.2)
	world.fireRenderStepped(3)
	equal(coinsLabel.Text, "0", "выигрыш не показывается, пока колесо крутится")
	equal(coinsStat.Value, 0, "таблица лидеров тоже ждёт остановки колеса")
	equal(resultPopup.Visible, false, "табличка выигрыша скрыта во время крутки")

	Harness.advance(0.3)
	stopOnFailures("первая крутка")

	local tier = nil
	for index, count in session.data.counts do
		if count ~= countsBefore[index] then
			tier = index
		end
	end
	check(tier ~= nil, "счётчик выпадений вырос")
	equal(tierUnderPointer(), tier, "колесо остановилось на выпавшем секторе")
	equal(resultPopup.Visible, true, "табличка выигрыша показана")
	equal(session.data.coins, Wheel.getReward(tier, 0, 0, false), "начислена награда сектора")
	equal(coinsStat.Value, session.data.coins, "таблица лидеров обновилась")
	settleCoins()
	equal(coinsLabel.Text, Wheel.formatNumber(session.data.coins), "монеты на экране догнали сервер")
	equal(spinButton.Text, "КРУТИТЬ", "кнопка снова активна")
	equal(title.Enabled, true, "подпись над головой показана")
	equal(title.Label.Text, Config.Segments[tier].name, "в подписи — выпавшая редкость")
end

-- Каждый тир: колесо должно остановиться именно на нём.
for tier = 1, #Config.Segments do
	local odds = Wheel.getOdds(1)
	local roll = 0
	for index = 1, tier - 1 do
		roll += odds[index]
	end
	table.insert(world.forcedRolls, roll + odds[tier] / 2)

	Harness.advance(2)
	local coinsBefore = session.data.coins
	click(spinButton)
	Harness.advance(Config.BaseSpinTime + 0.1)
	stopOnFailures(`крутка тира {tier}`)
	equal(tierUnderPointer(), tier, `колесо остановилось на тире {tier}`)
	equal(session.data.coins - coinsBefore, Wheel.getReward(tier, 0, 0, false), `награда тира {tier}`)
	equal(resultPopup.Visible, true, `табличка для тира {tier}`)

	-- Редкие тиры объявляются всем игрокам, частые — нет.
	local announcement = nil
	for _, toast in gui.Toasts:GetChildren() do
		if toast:IsA("TextLabel") and string.find(toast.Text, Config.Segments[tier].name, 1, true) then
			announcement = toast.Text
		end
	end
	if Config.Segments[tier].announce then
		check(announcement ~= nil, `тир {tier} объявлен`)
		contains(announcement, "Тестер выбил", `объявление тира {tier} называет игрока`)
		contains(announcement, Wheel.formatNumber(Wheel.getReward(tier, 0, 0, false)), `объявление тира {tier} называет выигрыш`)
	else
		equal(announcement, nil, `тир {tier} не объявляется`)
	end
end

equal(session.data.best, #Config.Segments, "лучший тир — джекпот")
equal(title.Label.Text, "ДЖЕКПОТ", "над головой — джекпот")

do
	Harness.advance(20)
	local remaining = 0
	for _, toast in gui.Toasts:GetChildren() do
		if toast:IsA("TextLabel") then
			remaining += 1
		end
	end
	equal(remaining, 0, "объявления со временем исчезают")
end

do
	Harness.advance(5)
	local Spin = ReplicatedStorage.Remotes.Spin
	local first = Spin:InvokeServer()
	local second = Spin:InvokeServer()
	check(first.ok == true, "первый прямой запрос принят")
	check(second.ok == false and second.reason == "cooldown", "второй запрос подряд отклонён перезарядкой")
	Harness.advance(5)
end

---------------------------------------------------------------------------------------------------
print("5. Улучшения")
---------------------------------------------------------------------------------------------------

click(gui.Menu.Upgrades)
equal(upgradesPanel.Visible, true, "панель улучшений открылась")
local upgradesList = upgradesPanel.List
local coinsRow = rowByOrder(upgradesList, 1)
local luckRow = rowByOrder(upgradesList, 2)
local speedRow = rowByOrder(upgradesList, 3)
local autoRow = rowByOrder(upgradesList, 4)
local rebirthRow = rowByOrder(upgradesList, 50)
check(coinsRow and luckRow and speedRow and autoRow and rebirthRow, "все строки улучшений на месте")

do
	session.data.coins = 0
	click(coinsRow.Action)
	Harness.advance(0.1)
	equal(session.data.upgrades.coins, 0, "без монет улучшение не купить")

	session.data.coins = 10000000
	click(coinsRow.Action)
	Harness.advance(0.1)
	stopOnFailures("покупка улучшения")
	equal(session.data.upgrades.coins, 1, "уровень монет вырос")
	equal(session.data.coins, 10000000 - 60, "цена списана")
	contains(coinsRow.Title.Text, "ур. 1/50", "строка показывает новый уровень")
	contains(coinsRow.Detail.Text, "x1.5 → x2", "строка показывает эффект")
	equal(coinsRow.Action.Text, "78", "кнопка показывает следующую цену")
	contains(statsLabel.Text, "Монеты x1.5", "множитель в шапке обновился")
	equal(
		disc:FindFirstChildOfClass("TextLabel") ~= nil,
		true,
		"на колесе есть подписи"
	)

	click(luckRow.Action)
	Harness.advance(0.1)
	equal(session.data.upgrades.luck, 1, "уровень удачи вырос")
	contains(statsLabel.Text, "Удача x1.25", "удача в шапке обновилась")

	for _ = 1, Config.Upgrades.speed.maxLevel + 2 do
		click(speedRow.Action)
		Harness.advance(0.05)
	end
	equal(session.data.upgrades.speed, Config.Upgrades.speed.maxLevel, "скорость не поднимается выше максимума")
	equal(speedRow.Action.Text, "МАКС", "на максимуме кнопка говорит МАКС")

	local spinsBefore = session.data.spins
	click(spinButton)
	Harness.advance(Config.MinSpinTime + 0.1)
	equal(session.data.spins, spinsBefore + 1, "крутка с максимальной скоростью")
	equal(spinButton.Text, "КРУТИТЬ", "быстрая крутка закончилась за секунду")
	stopOnFailures("быстрая крутка")
end

---------------------------------------------------------------------------------------------------
print("6. Авто-крутка")
---------------------------------------------------------------------------------------------------

do
	Harness.advance(2)
	click(autoButton)
	equal(session.data.spins > 0 and autoButton.Text ~= "АВТО\nвкл", true, "без покупки авто не включается")

	click(autoRow.Action)
	Harness.advance(0.1)
	equal(session.data.upgrades.auto, 1, "авто-крутка куплена")
	equal(autoRow.Action.Text, "Куплено", "строка авто-крутки отмечена купленной")
	equal(autoButton.Text, "АВТО\nвыкл", "кнопка авто доступна")
	local coinsAfterAuto = session.data.coins
	click(autoRow.Action)
	Harness.advance(0.1)
	equal(session.data.coins, coinsAfterAuto, "повторная покупка авто не списывает монеты")

	local spinsBefore = session.data.spins
	click(autoButton)
	equal(autoButton.Text, "АВТО\nвкл", "авто включено")
	Harness.advance(15)
	stopOnFailures("авто-крутка")
	local automatic = session.data.spins - spinsBefore
	check(automatic >= 9 and automatic <= 11, `за 15 секунд авто делает около 10 круток (сделано {automatic})`)

	click(autoButton)
	equal(autoButton.Text, "АВТО\nвыкл", "авто выключено")
	Harness.advance(3)
	local spinsStopped = session.data.spins
	Harness.advance(10)
	equal(session.data.spins, spinsStopped, "после выключения колесо не крутится само")
	equal(spinButton.Text, "КРУТИТЬ", "кнопка вернулась")
end

---------------------------------------------------------------------------------------------------
print("7. Перерождение")
---------------------------------------------------------------------------------------------------

do
	session.data.coins = 0
	click(luckRow.Action) -- отказ: монет нет, клиент остаётся со старым числом
	Harness.advance(0.1)
	session.data.coins = Wheel.getRebirthCost(0) + 1000
	click(coinsRow.Action) -- синхронизируем клиент с сервером
	Harness.advance(0.1)
	settleCoins()

	local cost = Wheel.getRebirthCost(0)
	equal(rebirthRow.Action.Text, Wheel.formatNumber(cost), "кнопка перерождения показывает цену")
	click(rebirthRow.Action)
	Harness.advance(0.1)
	equal(rebirthRow.Action.Text, "Точно?", "первое нажатие просит подтверждения")
	equal(session.data.rebirths, 0, "без подтверждения перерождения нет")

	Harness.advance(5)
	equal(rebirthRow.Action.Text, Wheel.formatNumber(cost), "подтверждение сбрасывается через несколько секунд")

	click(rebirthRow.Action)
	Harness.advance(0.1)
	click(rebirthRow.Action)
	Harness.advance(0.1)
	stopOnFailures("перерождение")
	equal(session.data.rebirths, 1, "перерождение выполнено")
	equal(session.data.coins, 0, "монеты сброшены")
	equal(session.data.upgrades.coins, 0, "улучшение монет сброшено")
	equal(session.data.upgrades.speed, 0, "скорость сброшена")
	equal(session.data.upgrades.auto, 1, "авто-крутка сохранилась")
	contains(statsLabel.Text, "Монеты x2", "бонус перерождения в шапке")
	contains(rebirthRow.Title.Text, "Перерождение · 1", "строка показывает число перерождений")
	contains(title.Label.Text, "ребёрт 1", "над головой видно перерождение")
	equal(leaderstats["Ребёрты"].Value, 1, "таблица лидеров показывает перерождение")
	settleCoins()
	equal(coinsLabel.Text, "0", "монеты на экране обнулились")

	click(rebirthRow.Action)
	Harness.advance(0.1)
	equal(session.data.rebirths, 1, "без монет второе перерождение недоступно")
end

---------------------------------------------------------------------------------------------------
print("8. Шансы, меню, клавиша")
---------------------------------------------------------------------------------------------------

do
	click(gui.Menu.Odds)
	equal(oddsPanel.Visible, true, "панель шансов открылась")
	equal(upgradesPanel.Visible, false, "панель улучшений при этом закрылась")
	local odds = Wheel.getOdds(Wheel.getLuck(session.data.upgrades.luck, session.passes.doubleLuck == true))
	for tier = 1, #Config.Segments do
		local row = rowByOrder(oddsPanel.List, tier)
		check(row ~= nil, `строка шансов тира {tier}`)
		equal(row.Chance.Text, Wheel.formatOdds(odds[tier]), `шанс тира {tier} в панели`)
		equal(row.TierName.Text, Config.Segments[tier].name, `название тира {tier} в панели`)
		equal(
			row.Count.Text,
			"выпадал: " .. Wheel.formatNumber(session.data.counts[tier]),
			`счётчик тира {tier} в панели`
		)
	end
	click(oddsPanel.Close)
	equal(oddsPanel.Visible, false, "крестик закрывает панель")

	click(gui.Menu.Hide)
	equal(center.Visible, false, "колесо скрыто")
	equal(gui.Menu.Hide.Text, "Показать колесо", "кнопка предлагает вернуть колесо")
	click(gui.Menu.Hide)
	equal(center.Visible, true, "колесо возвращено")

	Harness.advance(5)
	local spinsBefore = session.data.spins
	local UserInputService = game:GetService("UserInputService")
	Harness.fire(UserInputService, "InputBegan", { KeyCode = roblox.Enum.KeyCode.E }, true)
	equal(session.data.spins, spinsBefore, "клавиша E не срабатывает, пока игрок печатает в чате")
	Harness.fire(UserInputService, "InputBegan", { KeyCode = roblox.Enum.KeyCode.E }, false)
	equal(session.data.spins, spinsBefore + 1, "клавиша E крутит колесо")
	Harness.advance(6)

	local rotationBefore = bigWheel:FindFirstChildOfClass("Frame").Wheel.Disc.Rotation
	world.fireRenderStepped(10)
	check(
		bigWheel:FindFirstChildOfClass("Frame").Wheel.Disc.Rotation ~= rotationBefore,
		"большое колесо в лобби вращается"
	)
	stopOnFailures("панели и меню")
end

---------------------------------------------------------------------------------------------------
print("9. Геймпассы")
---------------------------------------------------------------------------------------------------

do
	local passRow = rowByOrder(upgradesList, 101)
	if withPasses then
		check(passRow ~= nil, "строки пассов показаны, когда ID заданы")
		equal(passRow.Action.Text, "Купить", "пасс можно купить")
		click(passRow.Action)
		equal(world.prompts[1], 111, "клиент открыл окно покупки нужного пасса")

		local MarketplaceService = game:GetService("MarketplaceService")
		Harness.fire(MarketplaceService, "PromptGamePassPurchaseFinished", player, 111, false)
		Harness.advance(0.1)
		equal(session.passes.doubleCoins, nil, "отменённая покупка ничего не даёт")

		local rewardBefore = Wheel.getReward(1, session.data.upgrades.coins, session.data.rebirths, false)
		Harness.fire(MarketplaceService, "PromptGamePassPurchaseFinished", player, 111, true)
		Harness.advance(0.1)
		stopOnFailures("покупка пасса")
		equal(session.passes.doubleCoins, true, "сервер выдал пасс")
		equal(passRow.Action.Text, "Куплено", "строка пасса отмечена купленной")

		Harness.advance(5)
		table.insert(world.forcedRolls, 0)
		local coinsBefore = session.data.coins
		click(spinButton)
		Harness.advance(Config.BaseSpinTime + 0.2)
		equal(session.data.coins - coinsBefore, rewardBefore * 2, "пасс удваивает выигрыш")

		Harness.fire(MarketplaceService, "PromptGamePassPurchaseFinished", player, 222, true)
		Harness.advance(0.1)
		contains(statsLabel.Text, "Удача x2", "пасс удачи удваивает удачу")
	else
		equal(passRow, nil, "без ID пассов строк с пассами нет")
		equal(#world.prompts, 0, "окно покупки не открывалось")
	end
end

---------------------------------------------------------------------------------------------------
print("10. Сохранения")
---------------------------------------------------------------------------------------------------

do
	local key = "player_" .. player.UserId
	local snapshot = {
		coins = session.data.coins,
		spins = session.data.spins,
		rebirths = session.data.rebirths,
		best = session.data.best,
		auto = session.data.upgrades.auto,
		jackpots = session.data.counts[8],
	}

	Harness.fire(Players, "PlayerRemoving", player)
	Harness.advance(0.1)
	stopOnFailures("выход игрока")
	equal(PlayerData.get(player), nil, "сессия закрыта при выходе")
	local stored = world.stores[Config.DataStoreName][key]
	check(stored ~= nil, "данные записаны в DataStore")

	local reloaded = PlayerData.load(player)
	equal(reloaded.data.coins, snapshot.coins, "монеты восстановились")
	equal(reloaded.data.spins, snapshot.spins, "крутки восстановились")
	equal(reloaded.data.rebirths, snapshot.rebirths, "перерождения восстановились")
	equal(reloaded.data.best, snapshot.best, "лучший тир восстановился")
	equal(reloaded.data.upgrades.auto, snapshot.auto, "авто-крутка восстановилась")
	equal(reloaded.data.counts[8], snapshot.jackpots, "счётчики выпадений восстановились")
	equal(#reloaded.data.counts, #Config.Segments, "счётчики остались списком")

	-- Сбой DataStore при загрузке: игрок играет с нуля, но старое сохранение не затирается.
	PlayerData.release(player)
	world.dataStoreFails = true
	world.isStudio = false
	local failed = nil
	Harness.spawn(function()
		failed = PlayerData.load(player)
	end)
	Harness.advance(10)
	check(failed ~= nil, "при сбое загрузки сессия всё равно открывается")
	equal(failed.canSave, false, "после сбоя загрузки сохранение запрещено")
	failed.data.coins = 5
	failed.dirty = true
	world.dataStoreFails = false
	PlayerData.release(player)
	equal(world.stores[Config.DataStoreName][key], stored, "сбой загрузки не затёр старое сохранение")

	-- Мусор в сохранении приводится к нормальному виду.
	world.isStudio = true
	local serde = require("@lune/serde")
	world.stores[Config.DataStoreName][key] = serde.encode("json", {
		coins = -50,
		spins = "много",
		upgrades = { coins = 9999, hack = 5 },
		counts = { 1, 2 },
	})
	local repaired = PlayerData.load(player)
	equal(repaired.data.coins, 0, "отрицательные монеты обнуляются")
	equal(repaired.data.spins, 0, "нечисловое значение обнуляется")
	equal(repaired.data.upgrades.coins, Config.Upgrades.coins.maxLevel, "уровень обрезается до максимума")
	equal(repaired.data.upgrades.hack, nil, "лишние улучшения отбрасываются")
	equal(repaired.data.counts[2], 2, "счётчики сохраняются")
	equal(#repaired.data.counts, #Config.Segments, "недостающие счётчики дополняются")

	for _, callback in world.closeCallbacks do
		Harness.spawn(callback)
	end
	Harness.advance(30)
	stopOnFailures("закрытие сервера")
end

stopOnFailures("конец")
print(`\nВсе проверки пройдены: {checks}` .. if withPasses then " (с геймпассами)" else "")
