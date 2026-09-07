param()

$ErrorActionPreference = 'Stop'

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$headAsset = Join-Path $projectRoot 'assets\logo-head.png'
$androidResources = Join-Path $projectRoot 'android\app\src\main\res'
$favicon = Join-Path $projectRoot 'public\images\favicon.ico'
$magick = (Get-Command magick -ErrorAction Stop).Source
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$temporaryDirectory = Join-Path $temporaryRoot (
    'sep-brand-assets-' + [guid]::NewGuid().ToString('N')
)

if (-not (Test-Path -LiteralPath $headAsset)) {
    throw "Missing head-only logo: $headAsset"
}

New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null

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

try {
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
        $background = & $magick identify -format '%[pixel:p{0,0}]' -- $splashFile.FullName
        $headSize = [Math]::Max(1, [int][Math]::Round($sourceIconSize * 0.73))
        $resizedHead = Join-Path $temporaryDirectory "head-$resourceDirectory.png"
        $renderedSplash = Join-Path $temporaryDirectory "splash-$resourceDirectory.png"

        & $magick $headAsset -resize "${headSize}x${headSize}" $resizedHead
        & $magick -size $canvasSize "xc:$background" $resizedHead `
            -gravity center -composite $renderedSplash
        Copy-GeneratedAsset $renderedSplash $splashFile.FullName
    }

    $renderedSplashIcon = Join-Path $temporaryDirectory 'splash-icon.png'
    $resizedSplashHead = Join-Path $temporaryDirectory 'splash-head.png'
    & $magick $headAsset -resize 96x96 $resizedSplashHead
    & $magick -size 288x288 xc:none $resizedSplashHead `
        -gravity center -composite $renderedSplashIcon
    Copy-GeneratedAsset $renderedSplashIcon (
        Join-Path $androidResources 'drawable\splash_icon.png'
    )

    $faviconParts = @()
    foreach ($faviconSize in @(16, 32, 48, 64)) {
        $faviconPart = Join-Path $temporaryDirectory "favicon-$faviconSize.png"
        $faviconHead = Join-Path $temporaryDirectory "favicon-head-$faviconSize.png"
        $innerSize = [Math]::Max(1, $faviconSize - 2)
        & $magick $headAsset -resize "${innerSize}x${innerSize}" $faviconHead
        & $magick -size "${faviconSize}x${faviconSize}" xc:none $faviconHead `
            -gravity center -composite $faviconPart
        $faviconParts += $faviconPart
    }

    $renderedFavicon = Join-Path $temporaryDirectory 'favicon.ico'
    & $magick $faviconParts $renderedFavicon
    Copy-GeneratedAsset $renderedFavicon $favicon

    $headAlpha = Join-Path $temporaryDirectory 'head-alpha.png'
    $headLuminance = Join-Path $temporaryDirectory 'head-luminance.png'
    $notificationMask = Join-Path $temporaryDirectory 'notification-mask.png'
    $notificationIcon = Join-Path $temporaryDirectory 'notification-icon.png'
    $headGeometry = & $magick identify -format '%wx%h' -- $headAsset

    & $magick $headAsset -alpha extract $headAlpha
    & $magick $headAsset -alpha off -colorspace Gray -threshold 28% $headLuminance
    # Preserve the transparent area outside the head and use the opposite
    # luminance mask from the former square-looking icon. Android can then
    # tint just the robot head without drawing a surrounding tile.
    & $magick $headAlpha $headLuminance -compose Multiply -composite `
        $notificationMask
    & $magick -size $headGeometry xc:white $notificationMask -alpha off `
        -compose CopyOpacity -composite -resize 86x86 -gravity center `
        -background none -extent 96x96 $notificationIcon
    $notificationDensities = @{
        'drawable-mdpi' = 24
        'drawable-hdpi' = 36
        'drawable-xhdpi' = 48
        'drawable-xxhdpi' = 72
        'drawable-xxxhdpi' = 96
    }

    foreach ($entry in $notificationDensities.GetEnumerator()) {
        $renderedMonoIcon = Join-Path $temporaryDirectory (
            "notification-mono-$($entry.Key).png"
        )
        & $magick $notificationIcon -resize "$($entry.Value)x$($entry.Value)" `
            $renderedMonoIcon
        Copy-GeneratedAsset $renderedMonoIcon (
            Join-Path $androidResources (
                "$($entry.Key)\notification_statusbar_robot_head_2026.png"
            )
        )
    }

    # HyperOS Classic renders the application icon at the left edge of a
    # notification and caches it by resource ID. Keep the legacy launcher
    # files for compatibility, but publish the current artwork under a fresh
    # resource name so an update cannot reuse the old CHAT icon from cache.
    foreach ($density in @('ldpi', 'mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi')) {
        $mipmapDirectory = Join-Path $androidResources "mipmap-$density"
        Copy-GeneratedAsset (
            Join-Path $mipmapDirectory 'ic_launcher.png'
        ) (
            Join-Path $mipmapDirectory 'sep_launcher_robot_2026.png'
        )
        Copy-GeneratedAsset (
            Join-Path $mipmapDirectory 'ic_launcher_round.png'
        ) (
            Join-Path $mipmapDirectory 'sep_launcher_robot_round_2026.png'
        )
        Copy-GeneratedAsset (
            Join-Path $mipmapDirectory 'ic_launcher_background.png'
        ) (
            Join-Path $mipmapDirectory 'sep_launcher_robot_background_2026.png'
        )
        Copy-GeneratedAsset (
            Join-Path $mipmapDirectory 'ic_launcher_foreground.png'
        ) (
            Join-Path $mipmapDirectory 'sep_launcher_robot_foreground_2026.png'
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
