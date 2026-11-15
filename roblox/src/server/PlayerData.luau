--!strict
-- Прогресс игроков: загрузка, хранение на время сессии и сохранение в DataStore.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

local Config = require(game:GetService("ReplicatedStorage").Shared.Config)

export type Data = {
	version: number,
	coins: number,
	spins: number,
	rebirths: number,
	best: number, -- самый редкий тир, который выпадал
	upgrades: { [string]: number },
	counts: { number }, -- сколько раз выпал каждый тир
}

export type Session = {
	data: Data,
	passes: { [string]: boolean },
	lastSpin: number,
	canSave: boolean, -- false, если загрузка не удалась: тогда не затираем старое сохранение
	dirty: boolean,
}

local PlayerData = {}

local sessions: { [Player]: Session } = {}
local activeSaves = 0 -- сколько записей в DataStore идёт прямо сейчас
local store: DataStore? = nil
local storeChecked = false

local function getStore(): DataStore?
	if not storeChecked then
		storeChecked = true
		local ok, result = pcall(function()
			return DataStoreService:GetDataStore(Config.DataStoreName)
		end)
		if ok then
			store = result
		else
			warn("[SpinAndWin] Сохранения недоступны: " .. tostring(result))
		end
	end
	return store
end

local function keyFor(player: Player): string
	return "player_" .. player.UserId
end

local function toCount(value: any, maximum: number): number
	if typeof(value) ~= "number" or value ~= value then
		return 0
	end
	return math.clamp(math.floor(value), 0, maximum)
end

-- Приводит сохранённую таблицу к актуальному виду: чинит типы и добавляет новые поля.
local function sanitize(raw: any): Data
	local source = if typeof(raw) == "table" then raw else {}
	local sourceUpgrades = if typeof(source.upgrades) == "table" then source.upgrades else {}
	local sourceCounts = if typeof(source.counts) == "table" then source.counts else {}

	local upgrades = {}
	for id, upgrade in Config.Upgrades do
		upgrades[id] = toCount(sourceUpgrades[id], upgrade.maxLevel)
	end

	local counts = table.create(#Config.Segments, 0)
	for tier = 1, #Config.Segments do
		counts[tier] = toCount(sourceCounts[tier], 2 ^ 53)
	end

	return {
		version = 1,
		coins = toCount(source.coins, Config.MaxCoins),
		spins = toCount(source.spins, 2 ^ 53),
		rebirths = toCount(source.rebirths, 1000),
		best = toCount(source.best, #Config.Segments),
		upgrades = upgrades,
		counts = counts,
	}
end

-- Загружает прогресс и открывает сессию. Возвращает nil, если игрок успел выйти.
function PlayerData.load(player: Player): Session?
	local dataStore = getStore()
	local raw: any = nil
	local canSave = false

	if dataStore then
		-- В Studio без доступа к API запрос падает сразу, повторять его бессмысленно.
		local attempts = if RunService:IsStudio() then 1 else 3
		for attempt = 1, attempts do
			local ok, result = pcall(function()
				return dataStore:GetAsync(keyFor(player))
			end)
			if ok then
				raw = result
				canSave = true
				break
			end
			warn(`[SpinAndWin] Не удалось загрузить данные {player.Name} (попытка {attempt}): {result}`)
			if attempt < attempts then
				task.wait(attempt)
			end
		end
	end

	if not player:IsDescendantOf(Players) then
		return nil
	end

	local session: Session = {
		data = sanitize(raw),
		passes = {},
		lastSpin = -math.huge,
		canSave = canSave,
		dirty = false,
	}
	sessions[player] = session
	return session
end

function PlayerData.get(player: Player): Session?
	return sessions[player]
end

function PlayerData.save(player: Player): boolean
	local session = sessions[player]
	local dataStore = getStore()
	if not session or not dataStore or not session.canSave then
		return false
	end
	if not session.dirty then
		return true
	end

	session.dirty = false
	activeSaves += 1
	local ok, result = pcall(function()
		dataStore:SetAsync(keyFor(player), session.data, { player.UserId })
	end)
	activeSaves -= 1
	if not ok then
		session.dirty = true
		warn(`[SpinAndWin] Не удалось сохранить данные {player.Name}: {result}`)
	end
	return ok
end

-- Сохраняет и закрывает сессию при выходе игрока.
function PlayerData.release(player: Player)
	PlayerData.save(player)
	sessions[player] = nil
end

-- Сохраняет всех перед выключением сервера и ждёт, пока запишутся и те сохранения,
-- что уже были запущены выходом игроков.
function PlayerData.saveAll()
	for player in sessions do
		task.spawn(PlayerData.save, player)
	end
	local deadline = os.clock() + 25
	while activeSaves > 0 and os.clock() < deadline do
		task.wait(0.1)
	end
end

return PlayerData
