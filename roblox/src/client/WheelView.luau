-- Рисует колесо без картинок: каждый сектор собран из тонких повёрнутых полосок.
-- Одно и то же колесо используется на экране игрока и на большом экране в лобби.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))
local Ui = require(script.Parent.Ui)

local WheelView = {}
WheelView.__index = WheelView

local STRIP_ANGLE = 2.5 -- ширина одной полоски в градусах; меньше — глаже края секторов
local BULB_COUNT = 16

-- Точка на круге: угол в градусах по часовой стрелке от верха, радиус в долях ширины колеса.
local function onCircle(angle: number, radius: number): UDim2
	local radians = math.rad(angle)
	return UDim2.fromScale(0.5 + radius * math.sin(radians), 0.5 - radius * math.cos(radians))
end

function WheelView.new(parent: Instance)
	local self = setmetatable({}, WheelView)

	local count = #Config.WheelOrder
	local segmentAngle = 360 / count
	local stripsPerSegment = math.ceil(segmentAngle / STRIP_ANGLE)
	local stripAngle = segmentAngle / stripsPerSegment
	-- Полоска длиной в радиус (0.5) перекрывает свой угол при ширине tan(угол / 2);
	-- небольшой запас убирает щели между соседними полосками.
	local stripWidth = math.tan(math.rad(stripAngle / 2)) * 1.3

	local root = Ui.create("Frame", {
		Name = "Wheel",
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		Parent = parent,
	})

	-- Золотой обод: круг под диском, который выглядывает по краям.
	Ui.create("Frame", {
		Name = "Rim",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Ui.Colors.gold,
		BorderSizePixel = 0,
		ZIndex = 1,
		Parent = root,
	}, { Ui.corner(UDim.new(0.5, 0)) })

	local disc = Ui.create("Frame", {
		Name = "Disc",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(0.93, 0.93),
		BackgroundTransparency = 1,
		ZIndex = 2,
		Parent = root,
	})

	self.rewardLabels = {}

	for position, tier in Config.WheelOrder do
		local segment = Config.Segments[tier]
		local startAngle = (position - 1) * segmentAngle
		local middle = startAngle + segmentAngle / 2
		local color = Color3.fromHex(segment.color)
		local textColor = Color3.fromHex(segment.textColor)

		for index = 0, stripsPerSegment - 1 do
			local angle = startAngle + (index + 0.5) * stripAngle
			Ui.create("Frame", {
				AnchorPoint = Vector2.new(0.5, 0.5),
				Position = onCircle(angle, 0.25),
				Size = UDim2.fromScale(stripWidth, 0.5),
				Rotation = angle,
				BackgroundColor3 = color,
				BorderSizePixel = 0,
				ZIndex = 1,
				Parent = disc,
			})
		end

		-- Разделитель между секторами.
		Ui.create("Frame", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = onCircle(startAngle, 0.25),
			Size = UDim2.fromScale(0.012, 0.5),
			Rotation = startAngle,
			BackgroundColor3 = Ui.Colors.background,
			BorderSizePixel = 0,
			ZIndex = 2,
			Parent = disc,
		})

		local rewardLabel = Ui.label({
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = onCircle(middle, 0.385),
			Size = UDim2.fromScale(0.27, 0.085),
			Rotation = middle,
			Font = Enum.Font.GothamBlack,
			Text = "x" .. segment.multiplier,
			TextColor3 = textColor,
			TextWrapped = false,
			ZIndex = 3,
			Parent = disc,
		}, 60)
		self.rewardLabels[tier] = rewardLabel

		Ui.label({
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = onCircle(middle, 0.285),
			Size = UDim2.fromScale(0.2, 0.05),
			Rotation = middle,
			Text = segment.name,
			TextColor3 = textColor,
			TextWrapped = false,
			ZIndex = 3,
			Parent = disc,
		}, 40)
	end

	-- Лампочки на ободе.
	self.bulbs = {}
	for index = 1, BULB_COUNT do
		local bulb = Ui.create("Frame", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = onCircle((index - 1) * (360 / BULB_COUNT) + 360 / BULB_COUNT / 2, 0.4825),
			Size = UDim2.fromScale(0.022, 0.022),
			BackgroundColor3 = Ui.Colors.text,
			BorderSizePixel = 0,
			ZIndex = 3,
			Parent = root,
		}, { Ui.corner(UDim.new(0.5, 0)) })
		table.insert(self.bulbs, bulb)
	end

	-- Ступица в центре.
	Ui.create("Frame", {
		Name = "Hub",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(0.2, 0.2),
		BackgroundColor3 = Ui.Colors.gold,
		BorderSizePixel = 0,
		ZIndex = 4,
		Parent = root,
	}, {
		Ui.corner(UDim.new(0.5, 0)),
		Ui.create("Frame", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.fromScale(0.7, 0.7),
			BackgroundColor3 = Ui.Colors.background,
			BorderSizePixel = 0,
		}, { Ui.corner(UDim.new(0.5, 0)) }),
	})

	-- Указатель сверху: ромб, нижний угол которого смотрит на выигравший сектор.
	Ui.create("Frame", {
		Name = "Pointer",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.035),
		Size = UDim2.fromScale(0.1, 0.1),
		Rotation = 45,
		BackgroundColor3 = Ui.Colors.text,
		BorderSizePixel = 0,
		ZIndex = 5,
		Parent = root,
	}, {
		Ui.corner(4),
		Ui.create("Frame", {
			AnchorPoint = Vector2.new(0.5, 0.5),
			Position = UDim2.fromScale(0.5, 0.5),
			Size = UDim2.fromScale(0.68, 0.68),
			BackgroundColor3 = Ui.Colors.red,
			BorderSizePixel = 0,
		}, { Ui.corner(3) }),
	})

	self.root = root
	self.disc = disc
	self.blinkPhase = false
	self.tween = nil

	return self
end

-- Меняет подписи наград на секторах. format получает номер тира и возвращает текст.
function WheelView:setRewardText(format: (tier: number) -> string)
	for tier, label in self.rewardLabels do
		label.Text = format(tier)
	end
end

-- Крутит колесо и останавливает его на секторе нужного тира. Ждёт конца анимации.
function WheelView:spinTo(tier: number, duration: number)
	local count = #Config.WheelOrder
	local segmentAngle = 360 / count
	local position = table.find(Config.WheelOrder, tier) or 1

	-- Останавливаемся не ровно по центру сектора, а в случайном месте внутри него.
	local center = (position - 0.5) * segmentAngle
	local jitter = (math.random() - 0.5) * segmentAngle * 0.7
	local stopAt = (-(center + jitter)) % 360

	if self.tween then
		self.tween:Cancel()
	end

	-- Сбрасываем накопленные обороты, чтобы угол не рос бесконечно.
	self.disc.Rotation %= 360
	local turns = math.max(2, math.round(duration * 1.5))
	local tween = TweenService:Create(
		self.disc,
		TweenInfo.new(duration, Enum.EasingStyle.Quart, Enum.EasingDirection.Out),
		{ Rotation = turns * 360 + stopAt }
	)
	self.tween = tween
	tween:Play()
	tween.Completed:Wait()
	if self.tween == tween then
		self.tween = nil
	end
end

-- Медленное вращение «для красоты» (большой экран в лобби).
function WheelView:rotate(degrees: number)
	self.disc.Rotation = (self.disc.Rotation + degrees) % 360
end

-- Переключает лампочки через одну.
function WheelView:blink()
	self.blinkPhase = not self.blinkPhase
	for index, bulb in self.bulbs do
		local lit = (index % 2 == 0) == self.blinkPhase
		bulb.BackgroundColor3 = if lit then Ui.Colors.text else Ui.Colors.goldDark
	end
end

return WheelView
