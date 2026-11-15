--!nocheck
-- Мини-эмулятор Roblox для проверки игры без Studio (запускается через Lune).
-- Загружает собранный файл места, подменяет сервисы и выполняет настоящие скрипты игры.
-- Свойства, классы и перечисления проверяет сама Lune по базе Roblox API: опечатка вроде
-- BackgroundColour3 или несуществующий Enum здесь падает так же, как упала бы в Studio.

local fs = require("@lune/fs")
local luau = require("@lune/luau")
local roblox = require("@lune/roblox")
local serde = require("@lune/serde")

local Harness = {}

---------------------------------------------------------------------------------------------------
-- Виртуальное время и планировщик: время идёт только когда тест вызывает advance()
---------------------------------------------------------------------------------------------------

local now = 0
local sequence = 0
local timers = {}
local failures = {}

local function resume(thread, ...)
	local ok, message = coroutine.resume(thread, ...)
	if not ok then
		table.insert(failures, debug.traceback(thread, tostring(message)))
	end
end

local function schedule(delay, thread, ...)
	sequence += 1
	table.insert(timers, { time = now + delay, order = sequence, thread = thread, args = table.pack(...) })
end

local taskLibrary = {}

function taskLibrary.spawn(callback, ...)
	local thread = if type(callback) == "thread" then callback else coroutine.create(callback)
	resume(thread, ...)
	return thread
end

function taskLibrary.defer(callback, ...)
	local thread = coroutine.create(callback)
	schedule(0, thread, ...)
	return thread
end

function taskLibrary.delay(delay, callback, ...)
	local thread = coroutine.create(callback)
	schedule(delay, thread, ...)
	return thread
end

function taskLibrary.wait(delay)
	local started = now
	schedule(math.max(delay or 0, 1 / 60), coroutine.running())
	coroutine.yield()
	return now - started
end

function taskLibrary.cancel(thread)
	for index = #timers, 1, -1 do
		if timers[index].thread == thread then
			table.remove(timers, index)
		end
	end
end

-- Проматывает время вперёд, выполняя всё, что запланировано на этот промежуток.
function Harness.advance(seconds)
	local target = now + seconds
	while true do
		local best = nil
		for index, timer in timers do
			if timer.time <= target then
				local current = best and timers[best]
				if
					not current
					or timer.time < current.time
					or (timer.time == current.time and timer.order < current.order)
				then
					best = index
				end
			end
		end
		if not best then
			break
		end
		local timer = table.remove(timers, best)
		now = math.max(now, timer.time)
		resume(timer.thread, table.unpack(timer.args, 1, timer.args.n))
	end
	now = target
end

-- Запускает функцию в отдельном потоке (как task.spawn в игре).
function Harness.spawn(callback, ...)
	return taskLibrary.spawn(callback, ...)
end

function Harness.now()
	return now
end

function Harness.failures()
	return failures
end

---------------------------------------------------------------------------------------------------
-- Сигналы (события)
---------------------------------------------------------------------------------------------------

local Signal = {}
Signal.__index = Signal

function Signal.new(queueWhenUnconnected)
	return setmetatable({
		handlers = {},
		waiting = {},
		queue = if queueWhenUnconnected then {} else nil,
	}, Signal)
end

function Signal:Connect(handler)
	assert(type(handler) == "function", "Connect ждёт функцию")
	table.insert(self.handlers, handler)
	if self.queue and #self.queue > 0 then
		local queued = self.queue
		self.queue = {}
		for _, args in queued do
			taskLibrary.spawn(handler, table.unpack(args, 1, args.n))
		end
	end
	local connection = { Connected = true }
	function connection.Disconnect()
		local index = table.find(self.handlers, handler)
		if index then
			table.remove(self.handlers, index)
		end
		connection.Connected = false
	end
	return connection
end

function Signal:Wait()
	table.insert(self.waiting, coroutine.running())
	return coroutine.yield()
end

function Signal:Fire(...)
	if #self.handlers == 0 and #self.waiting == 0 and self.queue then
		table.insert(self.queue, table.pack(...))
		return
	end
	for _, handler in table.clone(self.handlers) do
		taskLibrary.spawn(handler, ...)
	end
	local waiting = self.waiting
	self.waiting = {}
	for _, thread in waiting do
		taskLibrary.spawn(thread, ...)
	end
end

local signals = {}

local function signalOf(instance, name, queueWhenUnconnected)
	local bucket = signals[instance]
	if not bucket then
		bucket = {}
		signals[instance] = bucket
	end
	if not bucket[name] then
		bucket[name] = Signal.new(queueWhenUnconnected)
	end
	return bucket[name]
end

local function implementSignal(className, name, queueWhenUnconnected)
	roblox.implementProperty(className, name, function(self)
		return signalOf(self, name, queueWhenUnconnected)
	end)
end

-- Срабатывание события из теста, например Harness.fire(button, "Activated").
function Harness.fire(instance, name, ...)
	signalOf(instance, name):Fire(...)
end

---------------------------------------------------------------------------------------------------
-- Копирование «через сеть»: данные между сервером и клиентом и в DataStore проходят сериализацию
---------------------------------------------------------------------------------------------------

local function networkCopy(value)
	if type(value) ~= "table" then
		return value
	end
	local copy = {}
	for key, item in value do
		assert(type(key) == "string" or type(key) == "number", "ключ таблицы нельзя передать по сети")
		copy[key] = networkCopy(item)
	end
	return copy
end

local function copyAll(...)
	local packed = table.pack(...)
	for index = 1, packed.n do
		packed[index] = networkCopy(packed[index])
	end
	return table.unpack(packed, 1, packed.n)
end

---------------------------------------------------------------------------------------------------
-- Запуск
---------------------------------------------------------------------------------------------------

-- options.passIds: { ключ пасса = ID } — подставить ID геймпассов в Config до старта скриптов.
function Harness.start(placePath, options)
	options = options or {}

	local game = roblox.deserializePlace(fs.readFile(placePath))
	local Players = game:GetService("Players")
	local world = {
		game = game,
		forcedRolls = {}, -- очередь «случайных» чисел для сервера
		ownedPasses = {}, -- [passId] = true
		prompts = {}, -- ID пассов, покупку которых предложил клиент
		stores = {}, -- содержимое DataStore
		dataStoreFails = false,
		isStudio = options.isStudio ~= false,
		closeCallbacks = {},
	}

	-- Игрок ---------------------------------------------------------------------------------------

	local player = roblox.Instance.new("Player")
	player.Name = "Tester"
	player.UserId = 1001
	player.DisplayName = "Тестер"

	local playerGui = roblox.Instance.new("PlayerGui")
	playerGui.Name = "PlayerGui"
	playerGui.Parent = player

	local character = roblox.Instance.new("Model")
	character.Name = "Tester"
	local head = roblox.Instance.new("Part")
	head.Name = "Head"
	head.Parent = character
	character.Parent = game:GetService("Workspace")
	player.Character = character
	player.Parent = Players

	world.player = player
	world.playerGui = playerGui
	world.character = character

	-- Общие методы --------------------------------------------------------------------------------

	roblox.implementMethod("Instance", "WaitForChild", function(self, name, timeout)
		local child = self:FindFirstChild(name)
		if child then
			return child
		end
		if timeout then
			return nil
		end
		error(`WaitForChild("{name}") у {self:GetFullName()} ждал бы вечно`, 2)
	end)

	roblox.implementMethod("DataModel", "BindToClose", function(_, callback)
		table.insert(world.closeCallbacks, callback)
	end)

	-- Players -------------------------------------------------------------------------------------

	Players.LocalPlayer = player
	roblox.implementMethod("Players", "GetPlayers", function(self)
		local list = {}
		for _, child in self:GetChildren() do
			if child:IsA("Player") then
				table.insert(list, child)
			end
		end
		return list
	end)
	implementSignal("Players", "PlayerAdded")
	implementSignal("Players", "PlayerRemoving")
	implementSignal("Player", "CharacterAdded")

	-- RunService, ввод, звук ----------------------------------------------------------------------

	roblox.implementMethod("RunService", "IsStudio", function()
		return world.isStudio
	end)
	implementSignal("RunService", "RenderStepped")
	implementSignal("RunService", "Heartbeat")
	implementSignal("UserInputService", "InputBegan")
	implementSignal("GuiButton", "Activated")
	roblox.implementMethod("Sound", "Play", function() end)

	-- TweenService --------------------------------------------------------------------------------

	local TweenInfo = {}
	function TweenInfo.new(time, style, direction)
		assert(type(time) == "number", "TweenInfo.new: время должно быть числом")
		assert(style == nil or typeof(style) == "EnumItem", "TweenInfo.new: стиль должен быть Enum")
		assert(direction == nil or typeof(direction) == "EnumItem", "TweenInfo.new: направление должно быть Enum")
		return { Time = time, EasingStyle = style, EasingDirection = direction }
	end

	roblox.implementMethod("TweenService", "Create", function(_, instance, info, goals)
		assert(type(info) == "table" and info.Time, "TweenService:Create ждёт TweenInfo")
		for property, goal in goals do
			local current = instance[property] -- упадёт, если свойства нет
			assert(typeof(current) == typeof(goal), `твин {property}: тип цели не совпадает со свойством`)
		end
		local tween = { Completed = Signal.new() }
		local running = nil
		function tween:Play()
			running = taskLibrary.delay(info.Time, function()
				running = nil
				for property, goal in goals do
					instance[property] = goal
				end
				self.Completed:Fire(roblox.Enum.PlaybackState.Completed)
			end)
		end
		function tween:Cancel()
			if running then
				taskLibrary.cancel(running)
				running = nil
				self.Completed:Fire(roblox.Enum.PlaybackState.Cancelled)
			end
		end
		return tween
	end)

	-- Remotes -------------------------------------------------------------------------------------

	local serverInvoke = {}
	roblox.implementProperty("RemoteFunction", "OnServerInvoke", function(self)
		return serverInvoke[self]
	end, function(self, callback)
		serverInvoke[self] = callback
	end)
	roblox.implementMethod("RemoteFunction", "InvokeServer", function(self, ...)
		local callback = serverInvoke[self]
		assert(callback, `у {self.Name} нет OnServerInvoke`)
		return copyAll(callback(player, copyAll(...)))
	end)

	implementSignal("RemoteEvent", "OnClientEvent", true)
	roblox.implementMethod("RemoteEvent", "FireClient", function(self, target, ...)
		assert(target == player, "FireClient: неизвестный игрок")
		signalOf(self, "OnClientEvent", true):Fire(copyAll(...))
	end)
	roblox.implementMethod("RemoteEvent", "FireAllClients", function(self, ...)
		signalOf(self, "OnClientEvent", true):Fire(copyAll(...))
	end)

	-- MarketplaceService --------------------------------------------------------------------------

	implementSignal("MarketplaceService", "PromptGamePassPurchaseFinished")
	roblox.implementMethod("MarketplaceService", "UserOwnsGamePassAsync", function(_, userId, passId)
		assert(userId == player.UserId, "UserOwnsGamePassAsync: неизвестный игрок")
		return world.ownedPasses[passId] == true
	end)
	roblox.implementMethod("MarketplaceService", "PromptGamePassPurchase", function(_, target, passId)
		assert(target == player, "PromptGamePassPurchase: неизвестный игрок")
		table.insert(world.prompts, passId)
	end)

	-- DataStoreService ----------------------------------------------------------------------------

	roblox.implementMethod("DataStoreService", "GetDataStore", function(_, name)
		if options.noDataStore then
			error("You must publish this place to the web to access DataStore.")
		end
		world.stores[name] = world.stores[name] or {}
		local contents = world.stores[name]
		local store = {}
		function store:GetAsync(key)
			if world.dataStoreFails then
				error("502: API Services rejected request")
			end
			local encoded = contents[key]
			return if encoded then serde.decode("json", encoded) else nil
		end
		function store:SetAsync(key, value)
			if world.dataStoreFails then
				error("502: API Services rejected request")
			end
			-- Настоящий DataStore хранит JSON: так же проверяем, что данные в него превращаются.
			contents[key] = serde.encode("json", value)
		end
		return store
	end)

	-- Среда выполнения скриптов -------------------------------------------------------------------

	local Random = {}
	function Random.new()
		local generator = {}
		function generator:NextNumber()
			if #world.forcedRolls > 0 then
				return table.remove(world.forcedRolls, 1)
			end
			return math.random()
		end
		return generator
	end

	local modules = {}
	local requireModule

	local function environmentFor(scriptInstance)
		return {
			game = game,
			workspace = game:GetService("Workspace"),
			script = scriptInstance,
			require = requireModule,
			task = taskLibrary,
			os = setmetatable({
				clock = function()
					return now
				end,
			}, { __index = os }),
			Instance = roblox.Instance,
			Enum = roblox.Enum,
			Color3 = roblox.Color3,
			UDim = roblox.UDim,
			UDim2 = roblox.UDim2,
			Vector2 = roblox.Vector2,
			Vector3 = roblox.Vector3,
			CFrame = roblox.CFrame,
			TweenInfo = TweenInfo,
			Random = Random,
		}
	end

	local function load(scriptInstance)
		return luau.load(scriptInstance.Source, {
			debugName = scriptInstance:GetFullName(),
			environment = environmentFor(scriptInstance),
		})
	end

	function requireModule(moduleScript)
		assert(
			typeof(moduleScript) == "Instance" and moduleScript.ClassName == "ModuleScript",
			"require ждёт ModuleScript"
		)
		local cached = modules[moduleScript]
		if cached then
			return cached.value
		end
		local value = load(moduleScript)()
		modules[moduleScript] = { value = value }
		return value
	end

	world.require = requireModule

	-- Запускает Script или LocalScript из места в отдельном потоке.
	function world.run(scriptInstance)
		taskLibrary.spawn(load(scriptInstance))
	end

	function world.fireRenderStepped(frames)
		local RunService = game:GetService("RunService")
		for _ = 1, frames do
			signalOf(RunService, "RenderStepped"):Fire(1 / 60)
			Harness.advance(1 / 60)
		end
	end

	if options.passIds then
		local Config = requireModule(game:GetService("ReplicatedStorage").Shared.Config)
		for key, id in options.passIds do
			Config.GamePasses[key].id = id
		end
	end

	return world
end

return Harness
