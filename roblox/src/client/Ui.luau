-- Маленькие помощники для сборки интерфейса из кода.

local Ui = {}

Ui.Colors = {
	background = Color3.fromRGB(20, 18, 38),
	panel = Color3.fromRGB(30, 27, 56),
	row = Color3.fromRGB(44, 40, 80),
	gold = Color3.fromRGB(255, 214, 0),
	goldDark = Color3.fromRGB(59, 42, 0),
	green = Color3.fromRGB(56, 170, 78),
	red = Color3.fromRGB(229, 57, 53),
	disabled = Color3.fromRGB(86, 84, 104),
	text = Color3.fromRGB(255, 255, 255),
	textDim = Color3.fromRGB(184, 180, 214),
}

-- Создаёт объект, задаёт свойства и вкладывает детей. Parent ставится последним.
function Ui.create(className: string, props: { [string]: any }?, children: { Instance }?): any
	local instance = Instance.new(className) :: any
	local parent = nil
	if props then
		for key, value in props do
			if key == "Parent" then
				parent = value
			else
				instance[key] = value
			end
		end
	end
	if children then
		for _, child in children do
			child.Parent = instance
		end
	end
	if parent then
		instance.Parent = parent
	end
	return instance
end

-- Скругление: число — в пикселях, UDim — как есть (UDim.new(0.5, 0) даёт круг).
function Ui.corner(radius: number | UDim): UICorner
	local corner = Instance.new("UICorner")
	corner.CornerRadius = if typeof(radius) == "number" then UDim.new(0, radius) else radius
	return corner
end

function Ui.stroke(color: Color3, thickness: number): UIStroke
	local stroke = Instance.new("UIStroke")
	stroke.Color = color
	stroke.Thickness = thickness
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	return stroke
end

function Ui.textLimit(maxSize: number, minSize: number?): UITextSizeConstraint
	local limit = Instance.new("UITextSizeConstraint")
	limit.MaxTextSize = maxSize
	limit.MinTextSize = minSize or 1
	return limit
end

function Ui.sizeLimit(minSize: Vector2?, maxSize: Vector2?): UISizeConstraint
	local limit = Instance.new("UISizeConstraint")
	if minSize then
		limit.MinSize = minSize
	end
	if maxSize then
		limit.MaxSize = maxSize
	end
	return limit
end

-- Надпись, которая сама подгоняет размер шрифта под рамку.
function Ui.label(props: { [string]: any }, maxTextSize: number): TextLabel
	local label = Ui.create("TextLabel", {
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBold,
		TextColor3 = Ui.Colors.text,
		TextScaled = true,
		TextWrapped = true,
	}, { Ui.textLimit(maxTextSize) })
	for key, value in props do
		label[key] = value
	end
	return label
end

function Ui.button(props: { [string]: any }, maxTextSize: number): TextButton
	local button = Ui.create("TextButton", {
		AutoButtonColor = true,
		BackgroundColor3 = Ui.Colors.green,
		BorderSizePixel = 0,
		Font = Enum.Font.GothamBlack,
		TextColor3 = Ui.Colors.text,
		TextScaled = true,
		TextWrapped = true,
	}, {
		Ui.corner(12),
		Ui.textLimit(maxTextSize),
		-- Поля, чтобы текст не упирался в края кнопки на маленьких экранах.
		Ui.create("UIPadding", {
			PaddingLeft = UDim.new(0, 8),
			PaddingRight = UDim.new(0, 8),
			PaddingTop = UDim.new(0, 4),
			PaddingBottom = UDim.new(0, 4),
		}),
	})
	for key, value in props do
		button[key] = value
	end
	return button
end

return Ui
