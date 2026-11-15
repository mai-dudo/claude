--!strict
-- Главный серверный скрипт. Сервер сам выбирает сектор и считает награду,
-- клиент только показывает анимацию — поэтому накрутить монеты читами нельзя.

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Wheel = require(ReplicatedStorage.Shared.Wheel)
local PlayerData = require(script.PlayerData)
local World = require(script.World)

local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local GetState = Remotes:WaitForChild("GetState") :: RemoteFunction
local Spin = Remotes:WaitForChild("Spin") :: RemoteFunction
local BuyUpgrade = Remotes:WaitForChild("BuyUpgrade") :: RemoteFunction
local Rebirth = Remotes:WaitForChild("Rebirth") :: RemoteFunction
local StateChanged = Remotes:WaitForChild("StateChanged") :: RemoteEvent
local Announce = Remotes:WaitForChild("Announce") :: RemoteEvent

local rng = Random.new()

type Session = PlayerData.Session

-- Что клиент знает о своём прогрессе.
local function buildState(session: Session)
	local data = session.data
	return {
		coins = data.coins,
		spins = data.spins,
		rebirths = data.rebirths,
		best = data.best,
		upgrades = table.clone(data.upgrades),
		counts = table.clone(data.counts),
		passes = table.clone(session.passes),
		canSave = session.canSave,
	}
end

local function hasAuto(session: Session): boolean
	return session.data.upgrades.auto > 0 or session.passes.autoSpin == true
end

---------------------------------------------------------------------------------------------------
-- Таблица лидеров и подпись над головой
---------------------------------------------------------------------------------------------------

local function updateLeaderstats(player: Player, session: Session)
	local leaderstats = player:FindFirstChild("leaderstats")
	if not leaderstats then
		return
	end
	local coins = leaderstats:FindFirstChild("Монеты")
	local rebirths = leaderstats:FindFirstChild("Ребёрты")
	if coins and coins:IsA("NumberValue") then
		coins.Value = session.data.coins
	end
	if rebirths and rebirths:IsA("IntValue") then
		rebirths.Value = session.data.rebirths
	end
end

local function createLeaderstats(player: Player)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"

	local coins = Instance.new("NumberValue")
	coins.Name = "Монеты"
	coins.Parent = leaderstats

	local rebirths = Instance.new("IntValue")
	rebirths.Name = "Ребёрты"
	rebirths.Parent = leaderstats

	leaderstats.Parent = player
end

-- Над головой игрока видно самую редкую его находку — повод похвастаться.
local function getTitleLabel(head: BasePart): (BillboardGui, TextLabel)
	local existing = head:FindFirstChild("RarityTitle")
	if existing and existing:IsA("BillboardGui") then
		local existingLabel = existing:FindFirstChild("Label")
		if existingLabel and existingLabel:IsA("TextLabel") then
			return existing, existingLabel
		end
		existing:Destroy()
	end

	local billboard = Instance.new("BillboardGui")
	billboard.Name = "RarityTitle"
	billboard.Size = UDim2.fromScale(6, 1)
	billboard.StudsOffset = Vector3.new(0, 3, 0)
	billboard.MaxDistance = 80
	billboard.LightInfluence = 0

	local label = Instance.new("TextLabel")
	label.Name = "Label"
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBold
	label.TextScaled = true
	label.TextStrokeTransparency = 0.4
	label.Parent = billboard

	billboard.Parent = head
	return billboard, label
end

local function updateTitle(player: Player, session: Session)
	local character = player.Character
	local head = character and character:FindFirstChild("Head")
	if not head or not head:IsA("BasePart") then
		return
	end

	local billboard, label = getTitleLabel(head)
	local segment = Config.Segments[session.data.best]
	if not segment then
		billboard.Enabled = false
		return
	end

	local text = segment.name
	if session.data.rebirths > 0 then
		text ..= ` · ребёрт {session.data.rebirths}`
	end
	label.Text = text
	label.TextColor3 = Color3.fromHex(segment.accent)
	billboard.Enabled = true
end

local function refreshPublic(player: Player, session: Session)
	updateLeaderstats(player, session)
	updateTitle(player, session)
end

---------------------------------------------------------------------------------------------------
-- Геймпассы
---------------------------------------------------------------------------------------------------

local function loadPasses(player: Player, session: Session)
	for key, pass in Config.GamePasses do
		if pass.id ~= 0 then
			local ok, owned = pcall(function()
				return MarketplaceService:UserOwnsGamePassAsync(player.UserId, pass.id)
			end)
			if ok and owned then
				session.passes[key] = true
			end
		end
	end
end

MarketplaceService.PromptGamePassPurchaseFinished:Connect(function(player: Player, passId: number, purchased: boolean)
	if not purchased then
		return
	end
	local session = PlayerData.get(player)
	if not session then
		return
	end
	for key, pass in Config.GamePasses do
		if pass.id ~= 0 and pass.id == passId then
			session.passes[key] = true
			StateChanged:FireClient(player, buildState(session))
		end
	end
end)

---------------------------------------------------------------------------------------------------
-- Запросы от клиента
---------------------------------------------------------------------------------------------------

GetState.OnServerInvoke = function(player: Player)
	-- Данные грузятся в фоне; ждём, пока сессия откроется.
	local deadline = os.clock() + 15
	while os.clock() < deadline and player.Parent do
		local session = PlayerData.get(player)
		if session then
			return buildState(session)
		end
		task.wait(0.1)
	end
	return nil
end

Spin.OnServerInvoke = function(player: Player)
	local session = PlayerData.get(player)
	if not session then
		return { ok = false, reason = "loading" }
	end

	local data = session.data
	local now = os.clock()
	local spinTime = Wheel.getSpinTime(data.upgrades.speed)
	if now - session.lastSpin < spinTime - Config.SpinTolerance then
		return { ok = false, reason = "cooldown" }
	end
	session.lastSpin = now

	local luck = Wheel.getLuck(data.upgrades.luck, session.passes.doubleLuck == true)
	local tier = Wheel.roll(luck, rng:NextNumber())
	local reward = Wheel.getReward(tier, data.upgrades.coins, data.rebirths, session.passes.doubleCoins == true)

	data.coins = math.min(data.coins + reward, Config.MaxCoins)
	data.spins += 1
	data.counts[tier] += 1
	data.best = math.max(data.best, tier)
	session.dirty = true

	-- Таблицу лидеров и объявление показываем, когда колесо у игрока остановится,
	-- иначе результат будет виден раньше анимации.
	task.delay(spinTime, function()
		if not player.Parent then
			return
		end
		local current = PlayerData.get(player)
		if current then
			refreshPublic(player, current)
		end
		if Config.Segments[tier].announce then
			Announce:FireAllClients(player.DisplayName, tier, reward)
		end
	end)

	return { ok = true, tier = tier, reward = reward, state = buildState(session) }
end

BuyUpgrade.OnServerInvoke = function(player: Player, upgradeId: any)
	local session = PlayerData.get(player)
	if not session or typeof(upgradeId) ~= "string" or not Config.Upgrades[upgradeId] then
		return { ok = false, reason = "invalid" }
	end

	local data = session.data
	if upgradeId == "auto" and hasAuto(session) then
		return { ok = false, reason = "max" }
	end

	local cost = Wheel.getUpgradeCost(upgradeId, data.upgrades[upgradeId])
	if not cost then
		return { ok = false, reason = "max" }
	end
	if data.coins < cost then
		return { ok = false, reason = "coins" }
	end

	data.coins -= cost
	data.upgrades[upgradeId] += 1
	session.dirty = true
	updateLeaderstats(player, session)

	return { ok = true, state = buildState(session) }
end

Rebirth.OnServerInvoke = function(player: Player)
	local session = PlayerData.get(player)
	if not session then
		return { ok = false, reason = "loading" }
	end

	local data = session.data
	local cost = Wheel.getRebirthCost(data.rebirths)
	if data.coins < cost then
		return { ok = false, reason = "coins" }
	end

	data.coins = 0
	data.rebirths += 1
	for id in Config.Upgrades do
		if not Config.KeptOnRebirth[id] then
			data.upgrades[id] = 0
		end
	end
	session.dirty = true
	refreshPublic(player, session)

	return { ok = true, state = buildState(session) }
end

---------------------------------------------------------------------------------------------------
-- Вход и выход игроков
---------------------------------------------------------------------------------------------------

local function onPlayerAdded(player: Player)
	createLeaderstats(player)

	player.CharacterAdded:Connect(function(character: Model)
		-- Голова появляется чуть позже самого персонажа.
		local head = character:WaitForChild("Head", 10)
		local session = PlayerData.get(player)
		if head and session then
			updateTitle(player, session)
		end
	end)

	local session = PlayerData.load(player)
	if not session then
		return
	end
	loadPasses(player, session)
	refreshPublic(player, session)
	StateChanged:FireClient(player, buildState(session))
end

World.build()

Players.PlayerAdded:Connect(onPlayerAdded)
for _, player in Players:GetPlayers() do
	task.spawn(onPlayerAdded, player)
end

Players.PlayerRemoving:Connect(function(player: Player)
	PlayerData.release(player)
end)

task.spawn(function()
	while true do
		task.wait(Config.AutosaveInterval)
		for _, player in Players:GetPlayers() do
			task.spawn(PlayerData.save, player)
		end
	end
end)

game:BindToClose(function()
	PlayerData.saveAll()
end)
