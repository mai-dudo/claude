--!strict
-- Строит лобби при запуске сервера: площадку, большой экран с колесом и колонны в цветах редкостей.
-- Всё собрано из простых деталей, поэтому карту можно свободно менять или заменить своей.

local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)

local World = {}

local STAGE_CENTER = Vector3.new(0, 0, -25)
local STAGE_RADIUS = 28
local SPAWN_POINT = Vector3.new(0, 0, 20)
local SCREEN_SIZE = 32

local function makePart(parent: Instance, name: string, size: Vector3, cframe: CFrame, color: Color3): Part
	local part = Instance.new("Part")
	part.Name = name
	part.Anchored = true
	part.Size = size
	part.CFrame = cframe
	part.Color = color
	part.Material = Enum.Material.SmoothPlastic
	part.TopSurface = Enum.SurfaceType.Smooth
	part.BottomSurface = Enum.SurfaceType.Smooth
	part.Parent = parent
	return part
end

local function setupLighting()
	Lighting.ClockTime = 19.2
	Lighting.Brightness = 1.5
	Lighting.Ambient = Color3.fromRGB(80, 80, 110)
	Lighting.OutdoorAmbient = Color3.fromRGB(90, 90, 130)

	local bloom = Instance.new("BloomEffect")
	bloom.Intensity = 0.5
	bloom.Size = 24
	bloom.Threshold = 1.5
	bloom.Parent = Lighting
end

local function buildStage(lobby: Instance)
	-- Цилиндр лежит на боку, поэтому поворачиваем его осью вверх.
	local stage = makePart(
		lobby,
		"Stage",
		Vector3.new(1, STAGE_RADIUS * 2, STAGE_RADIUS * 2),
		CFrame.new(STAGE_CENTER + Vector3.new(0, 0.5, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		Color3.fromRGB(45, 40, 80)
	)
	stage.Shape = Enum.PartType.Cylinder

	local rim = makePart(
		lobby,
		"StageRim",
		Vector3.new(0.6, STAGE_RADIUS * 2 + 3, STAGE_RADIUS * 2 + 3),
		CFrame.new(STAGE_CENTER + Vector3.new(0, 0.3, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		Color3.fromRGB(255, 214, 0)
	)
	rim.Shape = Enum.PartType.Cylinder
	rim.Material = Enum.Material.Neon
end

local function buildScreen(lobby: Instance)
	local screenCenter = STAGE_CENTER + Vector3.new(0, 4 + SCREEN_SIZE / 2, -STAGE_RADIUS + 3)
	local facing = CFrame.lookAt(screenCenter, Vector3.new(SPAWN_POINT.X, screenCenter.Y, SPAWN_POINT.Z))

	-- Клиент вешает на этот экран колесо (см. client/init.client.luau).
	local screen = makePart(
		lobby,
		"WheelScreen",
		Vector3.new(SCREEN_SIZE, SCREEN_SIZE, 1),
		facing,
		Color3.fromRGB(15, 15, 25)
	)
	screen.CastShadow = false

	makePart(
		lobby,
		"ScreenFrame",
		Vector3.new(SCREEN_SIZE + 3, SCREEN_SIZE + 3, 1),
		facing * CFrame.new(0, 0, 0.6),
		Color3.fromRGB(70, 60, 120)
	)

	for _, side in { -1, 1 } do
		makePart(
			lobby,
			"ScreenLeg",
			Vector3.new(2.5, 5, 2.5),
			facing * CFrame.new(side * (SCREEN_SIZE / 2 - 3), -(SCREEN_SIZE / 2 + 2), 0.6),
			Color3.fromRGB(70, 60, 120)
		)
	end

	local sign = makePart(
		lobby,
		"TitleSign",
		Vector3.new(SCREEN_SIZE + 3, 6, 1),
		facing * CFrame.new(0, SCREEN_SIZE / 2 + 5.5, 0.6),
		Color3.fromRGB(25, 20, 50)
	)

	local surface = Instance.new("SurfaceGui")
	surface.Name = "Title"
	surface.Face = Enum.NormalId.Front
	surface.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	surface.PixelsPerStud = 30
	surface.LightInfluence = 0
	surface.Parent = sign

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.GothamBlack
	label.Text = "КРУТИ И ВЫИГРЫВАЙ"
	label.TextColor3 = Color3.fromRGB(255, 214, 0)
	label.TextScaled = true
	label.Parent = surface
end

local function buildPillars(lobby: Instance)
	for tier, segment in Config.Segments do
		-- Колонны стоят парами по бокам сцены: частые тиры ближе к спавну, редкие — у экрана.
		-- Проход от спавна к экрану остаётся свободным.
		local pair = math.ceil(tier / 2)
		local spread = -25 + (pair - 1) * 22
		local angle = math.rad(if tier % 2 == 1 then 180 - spread else spread)
		local offset = Vector3.new(math.cos(angle), 0, -math.sin(angle)) * (STAGE_RADIUS + 8)
		local base = STAGE_CENTER + offset
		local height = 8 + tier * 1.5
		local color = Color3.fromHex(segment.color)

		makePart(
			lobby,
			"Pillar",
			Vector3.new(3, height, 3),
			CFrame.new(base + Vector3.new(0, height / 2, 0)),
			Color3.fromRGB(40, 36, 70)
		)

		local cap = makePart(
			lobby,
			"PillarCap",
			Vector3.new(3.6, 1.2, 3.6),
			CFrame.new(base + Vector3.new(0, height + 0.6, 0)),
			color
		)
		cap.Material = Enum.Material.Neon

		local light = Instance.new("PointLight")
		light.Color = color
		light.Range = 18
		light.Brightness = 1.5
		light.Parent = cap
	end
end

function World.build()
	setupLighting()

	local lobby = Instance.new("Folder")
	lobby.Name = "Lobby"

	buildStage(lobby)
	buildScreen(lobby)
	buildPillars(lobby)

	lobby.Parent = workspace
end

return World
