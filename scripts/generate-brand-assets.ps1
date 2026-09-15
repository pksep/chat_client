param([switch] $AppIconsOnly)

$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$lightLogoAsset = Join-Path $projectRoot 'assets\logo-light.svg'
$darkLogoAsset = Join-Path $projectRoot 'assets\logo-dark.svg'
# Иконки приложения не зависят от темы интерфейса.
$appIconAsset = $darkLogoAsset
$androidResources = Join-Path $projectRoot 'android\app\src\main\res'
$iosSplashResources = Join-Path $projectRoot 'ios\App\App\Assets.xcassets\Splash.imageset'
$favicon = Join-Path $projectRoot 'public\images\favicon.ico'
$lightSplashBackground = '#F8F9FD'
$darkSplashBackground = '#262A38'
$magick = (Get-Command magick -ErrorAction Stop).Source
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporaryDirectory = Join-Path $temporaryRoot (
    'sep-brand-assets-' + [guid]::NewGuid().ToString('N')
)

foreach ($logoAsset in @($lightLogoAsset, $darkLogoAsset)) {
    if (-not (Test-Path -LiteralPath $logoAsset)) {
        throw "Missing Figma logo asset: $logoAsset"
    }
}

New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
$renderedSvgMasters = @{}

function Copy-GeneratedAsset {
    param(
        [Parameter(Mandatory = $true)] [string] $Source,
        [Parameter(Mandatory = $true)] [string] $Destination
    )

    $resolvedDestination = [IO.Path]::GetFullPath($Destination)
    if (-not $resolvedDestination.StartsWith($projectRoot, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Generated asset is outside the project: $resolvedDestination"
    }

    $destinationDirectory = Split-Path -Parent $resolvedDestination
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    [IO.File]::Copy($Source, $resolvedDestination, $true)
}

function Render-FigmaSvg {
    param(
        [Parameter(Mandatory = $true)] [string] $Source,
        [Parameter(Mandatory = $true)] [int] $Size,
        [Parameter(Mandatory = $true)] [string] $Destination
    )

    # Figma exports this mark with a 70x70 intrinsic viewport. Cache one
    # high-density render per source, then only downscale it with Lanczos.
    $masterKey = [IO.Path]::GetFullPath($Source)
    if (-not $renderedSvgMasters.ContainsKey($masterKey)) {
        $masterName = [IO.Path]::GetFileNameWithoutExtension($Source)
        $masterPath = Join-Path $temporaryDirectory "master-$masterName.png"
        & $magick -background none -density 2400 $Source $masterPath
        $renderedSvgMasters[$masterKey] = $masterPath
    }

    & $magick $renderedSvgMasters[$masterKey] -filter Lanczos `
        -resize "${Size}x${Size}" $Destination
}

try {
    # Общие PNG, PWA и Android всегда строятся из одного тёмного SVG.
    foreach ($appearance in @('light', 'dark')) {
        $sourceLogo = if ($appearance -eq 'dark') { $darkLogoAsset } else { $lightLogoAsset }
        $publicLogo = Join-Path $temporaryDirectory "logo-$appearance.png"
        Render-FigmaSvg $sourceLogo 1120 $publicLogo
        Copy-GeneratedAsset $publicLogo (Join-Path $projectRoot "public\images\logo-$appearance.png")
        if ($appearance -eq 'dark') {
            Copy-GeneratedAsset $publicLogo (Join-Path $projectRoot 'assets\logo.png')
        }
    }

    foreach ($size in @(64, 192, 512)) {
        $pwaIcon = Join-Path $temporaryDirectory "pwa-${size}x${size}.png"
        Render-FigmaSvg $appIconAsset $size $pwaIcon
        Copy-GeneratedAsset $pwaIcon (Join-Path $projectRoot "public\images\pwa-${size}x${size}.png")
    }

    foreach ($icon in @(
        @{ Name = 'maskable-icon-512x512.png'; Size = 512 },
        @{ Name = 'apple-touch-icon-180x180.png'; Size = 180 }
    )) {
        $iconSource = Join-Path $temporaryDirectory "source-$($icon.Name)"
        $iconOutput = Join-Path $temporaryDirectory $icon.Name
        Render-FigmaSvg $appIconAsset $icon.Size $iconSource
        & $magick $iconSource -background $darkSplashBackground -alpha remove -alpha off $iconOutput
        Copy-GeneratedAsset $iconOutput (Join-Path $projectRoot "public\images\$($icon.Name)")
    }

    foreach ($size in @(48, 72, 96, 128, 192, 256, 512)) {
        $legacyIcon = Join-Path $temporaryDirectory "icon-$size.webp"
        Render-FigmaSvg $appIconAsset $size $legacyIcon
        Copy-GeneratedAsset $legacyIcon (Join-Path $projectRoot "icons\icon-$size.webp")
    }

    foreach ($density in @('ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi')) {
        $mipmapDirectory = Join-Path $androidResources "mipmap-$density"
        foreach ($iconName in @('ic_launcher', 'ic_launcher_round', 'ic_launcher_foreground', 'ic_launcher_background')) {
            $iconDestination = Join-Path $mipmapDirectory "$iconName.png"
            $iconSize = [int](& $magick identify -format '%w' -- $iconDestination)
            $iconOutput = Join-Path $temporaryDirectory "$iconName-$density.png"
            if ($iconName -eq 'ic_launcher_background') {
                & $magick -size "${iconSize}x${iconSize}" "xc:$darkSplashBackground" $iconOutput
            } else {
                Render-FigmaSvg $appIconAsset $iconSize $iconOutput
            }
            Copy-GeneratedAsset $iconOutput $iconDestination
        }
    }

    # Заставки запуска сохраняют собственные светлую и тёмную темы.
    if (-not $AppIconsOnly) {
        $splashIconSizes = @{
            'drawable' = 64
            'drawable-night' = 48
            'drawable-land-hdpi' = 96
            'drawable-land-ldpi' = 48
            'drawable-land-mdpi' = 64
            'drawable-land-night-hdpi' = 96
            'drawable-land-night-ldpi' = 48
            'drawable-land-night-mdpi' = 64
            'drawable-land-night-xhdpi' = 144
            'drawable-land-night-xxhdpi' = 192
            'drawable-land-night-xxxhdpi' = 256
            'drawable-land-xhdpi' = 144
            'drawable-land-xxhdpi' = 192
            'drawable-land-xxxhdpi' = 256
            'drawable-port-hdpi' = 96
            'drawable-port-ldpi' = 48
            'drawable-port-mdpi' = 64
            'drawable-port-night-hdpi' = 96
            'drawable-port-night-ldpi' = 48
            'drawable-port-night-mdpi' = 64
            'drawable-port-night-xhdpi' = 144
            'drawable-port-night-xxhdpi' = 192
            'drawable-port-night-xxxhdpi' = 256
            'drawable-port-xhdpi' = 144
            'drawable-port-xxhdpi' = 192
            'drawable-port-xxxhdpi' = 256
        }

        $splashFiles = Get-ChildItem $androidResources -Recurse -File -Filter 'splash.png'
        foreach ($splashFile in $splashFiles) {
            $resourceDirectory = $splashFile.Directory.Name
            $sourceIconSize = $splashIconSizes[$resourceDirectory]
            if ($null -eq $sourceIconSize) {
                throw "Unknown splash resource directory: $resourceDirectory"
            }

            $canvasSize = & $magick identify -format '%wx%h' -- $splashFile.FullName
            $isDarkSplash = $resourceDirectory -like '*night*'
            $logoAsset = if ($isDarkSplash) { $darkLogoAsset } else { $lightLogoAsset }
            $background = if ($isDarkSplash) {
                $darkSplashBackground
            } else {
                $lightSplashBackground
            }
            $headSize = [Math]::Max(1, [int][Math]::Round($sourceIconSize * 0.73))
            $resizedHead = Join-Path $temporaryDirectory "head-$resourceDirectory.png"
            $renderedSplash = Join-Path $temporaryDirectory "splash-$resourceDirectory.png"

            Render-FigmaSvg $logoAsset $headSize $resizedHead
            & $magick -size $canvasSize "xc:$background" $resizedHead `
                -gravity center -composite $renderedSplash
            Copy-GeneratedAsset $renderedSplash $splashFile.FullName
        }

        $renderedSplashIcon = Join-Path $temporaryDirectory 'splash-icon.png'
        $resizedSplashHead = Join-Path $temporaryDirectory 'splash-head.png'
        Render-FigmaSvg $lightLogoAsset 96 $resizedSplashHead
        & $magick -size 288x288 xc:none $resizedSplashHead `
            -gravity center -composite $renderedSplashIcon
        Copy-GeneratedAsset $renderedSplashIcon (
            Join-Path $androidResources 'drawable\splash_icon.png'
        )

        $renderedDarkSplashIcon = Join-Path $temporaryDirectory 'splash-icon-dark.png'
        $resizedDarkSplashHead = Join-Path $temporaryDirectory 'splash-head-dark.png'
        Render-FigmaSvg $darkLogoAsset 96 $resizedDarkSplashHead
        & $magick -size 288x288 xc:none $resizedDarkSplashHead `
            -gravity center -composite $renderedDarkSplashIcon
        Copy-GeneratedAsset $renderedDarkSplashIcon (
            Join-Path $androidResources 'drawable-night\splash_icon.png'
        )

        $splashIconDensities = @{
            'ldpi' = 0.75
            'mdpi' = 1
            'hdpi' = 1.5
            'xhdpi' = 2
            'xxhdpi' = 3
            'xxxhdpi' = 4
        }
        foreach ($density in $splashIconDensities.Keys) {
            $scale = $splashIconDensities[$density]
            $canvasPixels = [int][Math]::Round(288 * $scale)
            $logoPixels = [int][Math]::Round(96 * $scale)

            foreach ($appearance in @(
                @{
                    Name = 'light'
                    Logo = $lightLogoAsset
                    Directory = "drawable-$density"
                },
                @{
                    Name = 'dark'
                    Logo = $darkLogoAsset
                    Directory = "drawable-night-$density"
                }
            )) {
                $densityLogo = Join-Path $temporaryDirectory (
                    "splash-head-$($appearance.Name)-$density.png"
                )
                $densitySplashIcon = Join-Path $temporaryDirectory (
                    "splash-icon-$($appearance.Name)-$density.png"
                )
                Render-FigmaSvg $appearance.Logo $logoPixels $densityLogo
                & $magick -size "${canvasPixels}x${canvasPixels}" xc:none $densityLogo `
                    -gravity center -composite $densitySplashIcon
                Copy-GeneratedAsset $densitySplashIcon (
                    Join-Path $androidResources "$($appearance.Directory)\splash_icon.png"
                )
            }
        }

        foreach ($iosSplash in Get-ChildItem $iosSplashResources -File -Filter '*.png') {
            $isDarkSplash = $iosSplash.Name -like '*-dark.png'
            $appearance = if ($isDarkSplash) { 'dark' } else { 'light' }
            $logoAsset = if ($isDarkSplash) { $darkLogoAsset } else { $lightLogoAsset }
            $background = if ($isDarkSplash) {
                $darkSplashBackground
            } else {
                $lightSplashBackground
            }
            $canvasSize = & $magick identify -format '%wx%h' -- $iosSplash.FullName
            $resizedLogo = Join-Path $temporaryDirectory "ios-$appearance-logo.png"
            $renderedSplash = Join-Path $temporaryDirectory $iosSplash.Name
            Render-FigmaSvg $logoAsset 360 $resizedLogo
            & $magick -size $canvasSize "xc:$background" $resizedLogo `
                -gravity center -composite $renderedSplash
            Copy-GeneratedAsset $renderedSplash $iosSplash.FullName
        }

    }

    $faviconParts = @()
    foreach ($faviconSize in @(16, 32, 48, 64)) {
        $faviconPart = Join-Path $temporaryDirectory "favicon-$faviconSize.png"
        $faviconHead = Join-Path $temporaryDirectory "favicon-head-$faviconSize.png"
        $innerSize = [Math]::Max(1, $faviconSize - 2)
        Render-FigmaSvg $appIconAsset $innerSize $faviconHead
        & $magick -size "${faviconSize}x${faviconSize}" xc:none $faviconHead `
            -gravity center -composite $faviconPart
        $faviconParts += $faviconPart
    }

    $renderedFavicon = Join-Path $temporaryDirectory 'favicon.ico'
    & $magick $faviconParts $renderedFavicon
    Copy-GeneratedAsset $renderedFavicon $favicon

    # HyperOS Classic renders the application icon at the left edge of a
    # notification and caches it by resource ID. Publish the current Figma
    # artwork under a fresh resource name so an update cannot reuse old art.
    foreach ($density in @('ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi')) {
        $mipmapDirectory = Join-Path $androidResources "mipmap-$density"
        Copy-GeneratedAsset (
            Join-Path $mipmapDirectory 'ic_launcher.png'
        ) (
            Join-Path $mipmapDirectory 'sep_launcher_chat_bubbles_2026.png'
        )
        Copy-GeneratedAsset (
            Join-Path $mipmapDirectory 'ic_launcher_round.png'
        ) (
            Join-Path $mipmapDirectory 'sep_launcher_chat_bubbles_round_2026.png'
        )
        Copy-GeneratedAsset (
            Join-Path $mipmapDirectory 'ic_launcher_background.png'
        ) (
            Join-Path $mipmapDirectory 'sep_launcher_chat_bubbles_background_2026.png'
        )
        Copy-GeneratedAsset (
            Join-Path $mipmapDirectory 'ic_launcher_foreground.png'
        ) (
            Join-Path $mipmapDirectory 'sep_launcher_chat_bubbles_foreground_2026.png'
        )
    }
} finally {
    $resolvedTemporaryDirectory = [IO.Path]::GetFullPath($temporaryDirectory)
    if (
        (Test-Path -LiteralPath $resolvedTemporaryDirectory) -and
        $resolvedTemporaryDirectory.StartsWith(
            $temporaryRoot,
            [StringComparison]::OrdinalIgnoreCase
        )
    ) {
        Remove-Item -LiteralPath $resolvedTemporaryDirectory -Recurse -Force
    }
}
