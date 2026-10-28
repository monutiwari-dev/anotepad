<?php
/**
 * PWA Icon Generator Script
 * This script creates PWA icons programmatically using GD library
 * Run: php create-icons.php
 */

// Check if GD library is available
if (!extension_loaded('gd')) {
    die("Error: GD library is not installed. Please install php-gd extension.\n");
}

$sizes = [72, 96, 128, 144, 152, 192, 384, 512];
$outputDir = __DIR__;

echo "Generating PWA icons...\n\n";

foreach ($sizes as $size) {
    // Create image
    $image = imagecreatetruecolor($size, $size);
    
    // Enable alpha blending
    imagealphablending($image, true);
    imagesavealpha($image, true);
    
    // Create transparent background
    $transparent = imagecolorallocatealpha($image, 0, 0, 0, 127);
    imagefill($image, 0, 0, $transparent);
    
    // Draw gradient background (simplified - solid color with rounded corners)
    $primaryColor = imagecolorallocate($image, 99, 102, 241); // #6366f1
    $secondaryColor = imagecolorallocate($image, 139, 92, 246); // #8b5cf6
    
    // Fill with primary color
    imagefilledrectangle($image, 0, 0, $size, $size, $primaryColor);
    
    // Draw rounded rectangle (simplified)
    $radius = $size * 0.15;
    $white = imagecolorallocate($image, 255, 255, 255);
    
    // Draw icon - simple note shape
    $padding = $size * 0.15;
    $noteWidth = $size - ($padding * 2);
    $noteHeight = $size - ($padding * 2);
    
    // Draw note shape (rectangle with folded corner)
    $points = [
        $padding, $padding,                    // Top-left
        $size - $padding, $padding,            // Top-right
        $size - $padding, $size - $padding * 1.5, // Bottom-right
        $size - $padding * 1.5, $size - $padding, // Fold point
        $padding, $size - $padding             // Bottom-left
    ];
    
    imagefilledpolygon($image, $points, 5, $white);
    
    // Draw lines on note
    $lineColor = imagecolorallocate($image, 200, 200, 200);
    $lineY = $padding + ($noteHeight * 0.3);
    for ($i = 0; $i < 3; $i++) {
        imageline($image, 
            $padding + 10, 
            $lineY + ($i * $noteHeight * 0.2), 
            $size - $padding - 10, 
            $lineY + ($i * $noteHeight * 0.2), 
            $lineColor
        );
    }
    
    // Save image
    $filename = $outputDir . "/icon-{$size}x{$size}.png";
    if (imagepng($image, $filename)) {
        echo "✓ Created: icon-{$size}x{$size}.png\n";
    } else {
        echo "✗ Failed: icon-{$size}x{$size}.png\n";
    }
    
    imagedestroy($image);
}

echo "\n✓ All icons generated successfully!\n";
echo "Icons saved in: {$outputDir}\n";
?>
