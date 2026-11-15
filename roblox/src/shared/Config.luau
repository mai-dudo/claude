--!strict
-- Все настройки игры в одном месте. Меняйте числа здесь — код трогать не нужно.

export type Segment = {
	id: string,
	name: string,
	color: string, -- цвет сектора, hex
	textColor: string, -- цвет надписи на секторе, hex
	accent: string, -- цвет названия на тёмном фоне (в списках и над головой), hex
	weight: number, -- базовый шанс в процентах (в сумме 100)
	multiplier: number, -- во сколько раз сектор умножает базовую награду
	announce: boolean, -- объявлять ли выпадение всему серверу
}

export type Upgrade = {
	name: string,
	description: string,
	maxLevel: number,
	baseCost: number,
	costGrowth: number, -- во сколько раз дорожает каждый следующий уровень
}

export type GamePass = {
	id: number, -- ID геймпасса из Creator Dashboard; 0 — пасс выключен
	name: string,
	description: string,
}

local Config = {}

-- Имя хранилища сохранений. Смена имени обнулит прогресс всех игроков.
Config.DataStoreName = "SpinAndWin_v1"
Config.AutosaveInterval = 90 -- секунд между автосохранениями

Config.BaseReward = 10 -- монет за «Обычный» сектор без улучшений
Config.MaxCoins = 1e15 -- потолок монет, чтобы числа оставались точными

Config.BaseSpinTime = 4.0 -- сколько секунд крутится колесо без улучшений
Config.MinSpinTime = 1.0
Config.SpinTimePerLevel = 0.3 -- на сколько секунд ускоряет каждый уровень «Скорости»
Config.SpinTolerance = 0.35 -- запас на задержку сети при проверке перезарядки

Config.LuckPerLevel = 0.25 -- +25% удачи за уровень
Config.CoinsPerLevel = 0.5 -- +50% монет за уровень
Config.RebirthBonus = 1 -- +100% монет за каждое перерождение
Config.RebirthBaseCost = 250000
Config.RebirthCostGrowth = 4

-- Сектора по возрастанию редкости. Номер в этом списке — «тир» сектора.
Config.Segments = {
	{
		id = "common",
		name = "Обычный",
		color = "#8d99ae",
		textColor = "#ffffff",
		accent = "#8d99ae",
		weight = 45,
		multiplier = 1,
		announce = false,
	},
	{
		id = "uncommon",
		name = "Необычный",
		color = "#43a047",
		textColor = "#ffffff",
		accent = "#43a047",
		weight = 27,
		multiplier = 3,
		announce = false,
	},
	{
		id = "rare",
		name = "Редкий",
		color = "#1e88e5",
		textColor = "#ffffff",
		accent = "#1e88e5",
		weight = 15,
		multiplier = 8,
		announce = false,
	},
	{
		id = "epic",
		name = "Эпический",
		color = "#8e24aa",
		textColor = "#ffffff",
		accent = "#8e24aa",
		weight = 8,
		multiplier = 25,
		announce = false,
	},
	{
		id = "legendary",
		name = "Легендарный",
		color = "#fb8c00",
		textColor = "#ffffff",
		accent = "#fb8c00",
		weight = 3.5,
		multiplier = 100,
		announce = false,
	},
	{
		id = "mythic",
		name = "Мифический",
		color = "#e53935",
		textColor = "#ffffff",
		accent = "#e53935",
		weight = 1.2,
		multiplier = 500,
		announce = true,
	},
	{
		id = "secret",
		name = "Секретный",
		color = "#1b1f3b",
		textColor = "#7df9ff",
		accent = "#7df9ff",
		weight = 0.25,
		multiplier = 3000,
		announce = true,
	},
	{
		id = "jackpot",
		name = "ДЖЕКПОТ",
		color = "#ffd600",
		textColor = "#3b2a00",
		accent = "#ffd600",
		weight = 0.05,
		multiplier = 25000,
		announce = true,
	},
} :: { Segment }

-- В каком порядке тиры стоят на колесе (по часовой стрелке от указателя).
-- Редкие сектора перемешаны с частыми, чтобы колесо выглядело живее.
Config.WheelOrder = { 1, 5, 2, 7, 3, 6, 4, 8 }

Config.Upgrades = {
	coins = {
		name = "Множитель монет",
		description = "+50% монет за каждую крутку",
		maxLevel = 50,
		baseCost = 60,
		costGrowth = 1.3,
	},
	luck = {
		name = "Удача",
		description = "Редкие сектора выпадают чаще",
		maxLevel = 20,
		baseCost = 150,
		costGrowth = 1.7,
	},
	speed = {
		name = "Скорость колеса",
		description = "Колесо останавливается быстрее",
		maxLevel = 10,
		baseCost = 250,
		costGrowth = 2.2,
	},
	auto = {
		name = "Авто-крутка",
		description = "Колесо крутится само",
		maxLevel = 1,
		baseCost = 5000,
		costGrowth = 1,
	},
} :: { [string]: Upgrade }

Config.UpgradeOrder = { "coins", "luck", "speed", "auto" }

-- Улучшения, которые сохраняются после перерождения.
Config.KeptOnRebirth = { auto = true } :: { [string]: boolean }

-- Геймпассы — так игра приносит робуксы вам как автору.
-- Создайте пассы в Creator Dashboard и впишите сюда их ID. Пока ID равен 0, пасс не показывается.
Config.GamePasses = {
	doubleCoins = {
		id = 0,
		name = "x2 монет",
		description = "Все выигрыши удваиваются навсегда",
	},
	doubleLuck = {
		id = 0,
		name = "x2 удача",
		description = "Удача удваивается навсегда",
	},
	autoSpin = {
		id = 0,
		name = "Авто-крутка",
		description = "Авто-крутка сразу и навсегда",
	},
} :: { [string]: GamePass }

Config.GamePassOrder = { "doubleCoins", "doubleLuck", "autoSpin" }

-- Звуки: впишите ID звуков из Toolbox. 0 — звук выключен.
Config.Sounds = {
	spin = 0,
	win = 0,
	rare = 0,
	buy = 0,
}

return Config
