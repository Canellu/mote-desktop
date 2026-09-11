---
title: "Color Conversion Formulas RGB to XY and Back"
keywords:
  [
    "color conversion",
    "RGB",
    "CIE xy",
    "gamut",
    "HSV",
    "color temperature",
    "Philips Hue color",
  ]
summary: "Formulas and code snippets for converting between RGB, CIE xy, HSV, and Hue color gamuts, including practical notes for Hue color lights."
---

# Color Conversion Formulas RGB to XY and back

## Gamut

The colors of Hue lights are controlled by xy values in the CIE color space. Since this is a well defined color space that is independent of the gamut of any specific light, we know for sure that the same xy value always result in the same color, regardless of the type of light used (as long as the color is within the gamut of the light).
Current Philips Hue lights have a [color gamut](https://developers.meethue.com/develop/get-started-2/core-concepts/) defined by 3 points, making it a triangle. The 3 triangles outline the colors which Hue can address.

!

For all newer model Hue lights (Gamut C) the corners of the triangle are

`Red: 0.6915, 0.3038 Green: 0.17, 0.7 Blue: 0.1532, 0.0475 `

For the older model hue bulb (Gamut B) the corners of the triangle are

`Red: 0.675, 0.322 Green: 0.409, 0.518 Blue: 0.167, 0.04 `

For legacy LivingColors Bloom, Aura, Light Strips and Iris (Gamut A) the triangle corners are:
`Red: 0.704, 0.296 Green: 0.2151, 0.7106 Blue: 0.138, 0.08 `

If you have light which is not one of those, you should use:
`Red: 1.0, 0 Green: 0.0, 1.0 Blue: 0.0, 0.0 `

The Hue API V2 exposes these gamuts on the API for each light resource, so you don’t need to hardcode them. If you have a color defined in RGB that you want to set the Hue lights to, then you need to convert it to xy. The next section outlines how to do that.

## RGB to xy

We start with the color to xy conversion, which we will do in a couple of steps:

1\. Get the RGB values from your color object and convert them to be between 0 and 1. So the RGB color (255, 0, 100) becomes (1.0, 0.0, 0.39)

2\. Apply a gamma correction to the RGB values, which makes the color more vivid and more the like the color displayed on the screen of your device.

This gamma correction is also applied to the screen of your computer or phone, thus we need this to create a similar color on the light as on screen. This is done by the following formulas:

```text
float red = (red > 0.04045f) ? pow((red + 0.055f) / (1.0f + 0.055f), 2.4f) : (red / 12.92f);
float green = (green > 0.04045f) ? pow((green + 0.055f) / (1.0f + 0.055f), 2.4f) : (green / 12.92f);
float blue = (blue > 0.04045f) ? pow((blue + 0.055f) / (1.0f + 0.055f), 2.4f) : (blue / 12.92f);
```

3\. Convert the RGB values to XYZ using the Wide RGB D65 conversion formula The formulas used:

```text
float X = red * 0.4124 + green * 0.3576 + blue * 0.1805;
float Y = red * 0.2126 + green * 0.7152 + blue * 0.0722;
float Z = red * 0.0193 + green * 0.1192 + blue * 0.9505;
```

4\. Calculate the xy values from the XYZ values

```text
float x = X / (X + Y + Z);
float y = Y / (X + Y + Z);
float brightness = Y;
```

5\. Check if the found xy value is within the color gamut of the light, if not continue with step 6, otherwise step 7 When we send a value which the light is not capable of, the resulting color might not be optimal. Therefore we try to only send values which are inside the color gamut of the selected light.

6\. Calculate the closest point on the color gamut triangle and use that as xy value The closest value is calculated by making a perpendicular line to one of the lines the triangle consists of and when it is then still not inside the triangle, we choose the closest corner point of the triangle.

7\. Use the Y value of XYZ as brightness The Y value indicates the brightness of the converted color.

## xy to RGB

The xy to color conversion is almost the same, but in reverse order.

1\. Check if the xy value is within the color gamut of the lamp, if not continue with step 2, otherwise step 3 We do this to calculate the most accurate color the given light can actually do.

2\. Calculate the closest point on the color gamut triangle and use that as xy value See step 6 of color to xy.

3\. Calculate XYZ values Convert using the following formulas:

```text
float x = x; // the given x value
float y = y; // the given y value
float z = 1.0f - x - y;
float Y = brightness; // The given brightness value
float X = (Y / y) * x;
float Z = (Y / y) * z;
```

4\. Convert to RGB using Wide RGB D65 conversion

```text
float r =  X * 1.656492f - Y * 0.354851f - Z * 0.255038f;
float g = -X * 0.707196f + Y * 1.655397f + Z * 0.036152f;
float b =  X * 0.051713f - Y * 0.121364f + Z * 1.011530f;
```

5\. Apply reverse gamma correction

```text
r = r <= 0.0031308f ? 12.92f * r : (1.0f + 0.055f) * pow(r, (1.0f / 2.4f)) - 0.055f;
g = g <= 0.0031308f ? 12.92f * g : (1.0f + 0.055f) * pow(g, (1.0f / 2.4f)) - 0.055f;
b = b <= 0.0031308f ? 12.92f * b : (1.0f + 0.055f) * pow(b, (1.0f / 2.4f)) - 0.055f;
```

6\. Convert the RGB values to your color object

The rgb values from the above formulas are between 0.0 and 1.0.

## HSV to RGB

But what if you have a color defined in HSV (Hue/Saturation/Brightness) instead of RGB or xy? Well then we can first convert from HSV to RGB, and then from RGB to xy. In this case we assume that Hue is between 0 and 360 degrees, and saturation and brightness between 0 and 100%.

```text
float s = S/100;
    float v = V/100;
    float C = s*v;
    float X = C*(1-fabs(fmod(H/60.0, 2)-1));
    float m = v-C;
    float r,g,b;
    if(H >= 0 && H < 60){
        r = C, g = X, b = 0;
    }
    else if(H >= 60 && H < 120){
        r = X, g = C, b = 0;
    }
    else if(H >= 120 && H < 180){
        r = 0, g = C, b = X;
    }
    else if(H >= 180 && H < 240){
        r = 0, g = X, b = C;
    }
    else if(H >= 240 && H < 300){
        r = X, g = 0, b = C;
    }
    else{
        r = C, g = 0, b = X;
    }
    int R = r+m;
    int G = g+m;
    int B = b+m;
```

The resulting RGB values are already between 0 and 1, so from here you can start with step 2 of the RGB to xy section.

## iOS SDK extract

The following code is an extract from the relevant methods in the iOS SDK. It is provided on an as is basis to help you create your own versions of the color conversion utilities. Note that the UIColor class contains a method to obtain Hue/Saturation values. [See more](http://developer.apple.com/library/ios/#documentation/UIKit/Reference/UIColor_Class/Reference/Reference.html)

```javascript
+ (UIColor *)colorFromXY:(CGPoint)xy forModel:(NSString*)model {
    NSArray *colorPoints = [self colorPointsForModel:model];
    BOOL inReachOfLamps = [self checkPointInLampsReach:xy withColorPoints:colorPoints];

    if (!inReachOfLamps) {
        //It seems the colour is out of reach
        //let's find the closest colour we can produce with our lamp and send this XY value out.

        //Find the closest point on each line in the triangle.
        CGPoint pAB =[self getClosestPointToPoints:[self getPointFromValue:[colorPoints objectAtIndex:cptRED]] point2:[self getPointFromValue:[colorPoints objectAtIndex:cptGREEN]] point3:xy];
        CGPoint pAC = [self getClosestPointToPoints:[self getPointFromValue:[colorPoints objectAtIndex:cptBLUE]] point2:[self getPointFromValue:[colorPoints objectAtIndex:cptRED]] point3:xy];
        CGPoint pBC = [self getClosestPointToPoints:[self getPointFromValue:[colorPoints objectAtIndex:cptGREEN]] point2:[self getPointFromValue:[colorPoints objectAtIndex:cptBLUE]] point3:xy];

        //Get the distances per point and see which point is closer to our Point.
        float dAB = [self getDistanceBetweenTwoPoints:xy point2:pAB];
        float dAC = [self getDistanceBetweenTwoPoints:xy point2:pAC];
        float dBC = [self getDistanceBetweenTwoPoints:xy point2:pBC];

        float lowest = dAB;
        CGPoint closestPoint = pAB;

        if (dAC < lowest) {
            lowest = dAC;
            closestPoint = pAC;
        }
        if (dBC < lowest) {
            lowest = dBC;
            closestPoint = pBC;
        }

        //Change the xy value to a value which is within the reach of the lamp.
        xy.x = closestPoint.x;
        xy.y = closestPoint.y;
    }

    float x = xy.x;
    float y = xy.y;
    float z = 1.0f - x - y;

    float Y = 1.0f;
    float X = (Y / y) * x;
    float Z = (Y / y) * z;

    // sRGB D65 conversion
    float r =  X * 1.656492f - Y * 0.354851f - Z * 0.255038f;
    float g = -X * 0.707196f + Y * 1.655397f + Z * 0.036152f;
    float b =  X * 0.051713f - Y * 0.121364f + Z * 1.011530f;

    if (r > b && r > g && r > 1.0f) {
        // red is too big
        g = g / r;
        b = b / r;
        r = 1.0f;
    }
    else if (g > b && g > r && g > 1.0f) {
        // green is too big
        r = r / g;
        b = b / g;
        g = 1.0f;
    }
    else if (b > r && b > g && b > 1.0f) {
        // blue is too big
        r = r / b;
        g = g / b;
        b = 1.0f;
    }

    // Apply gamma correction
    r = r <= 0.0031308f ? 12.92f * r : (1.0f + 0.055f) * pow(r, (1.0f / 2.4f)) - 0.055f;
    g = g <= 0.0031308f ? 12.92f * g : (1.0f + 0.055f) * pow(g, (1.0f / 2.4f)) - 0.055f;
    b = b <= 0.0031308f ? 12.92f * b : (1.0f + 0.055f) * pow(b, (1.0f / 2.4f)) - 0.055f;

    if (r > b && r > g) {
        // red is biggest
        if (r > 1.0f) {
            g = g / r;
            b = b / r;
            r = 1.0f;
        }
    }
    else if (g > b && g > r) {
        // green is biggest
        if (g > 1.0f) {
            r = r / g;
            b = b / g;
            g = 1.0f;
        }
    }
    else if (b > r && b > g) {
        // blue is biggest
        if (b > 1.0f) {
            r = r / b;
            g = g / b;
            b = 1.0f;
        }
    }

    return [UIColor colorWithRed:r green:g blue:b alpha:1.0f];
}

+ (NSArray *)colorPointsForModel:(NSString*)model {
    NSMutableArray *colorPoints = [NSMutableArray array];

    NSArray *hueBulbs = [NSArray arrayWithObjects:@"LCT001" /* Hue A19 */,
                         @"LCT002" /* Hue BR30 */,
                         @"LCT003" /* Hue GU10 */, nil];
    NSArray *livingColors = [NSArray arrayWithObjects:  @"LLC001" /* Monet, Renoir, Mondriaan (gen II) */,
                             @"LLC005" /* Bloom (gen II) */,
                             @"LLC006" /* Iris (gen III) */,
                             @"LLC007" /* Bloom, Aura (gen III) */,
                             @"LLC011" /* Hue Bloom */,
                             @"LLC012" /* Hue Bloom */,
                             @"LLC013" /* Storylight */,
                             @"LST001" /* Light Strips */, nil];
    if ([hueBulbs containsObject:model]) {
        // Hue bulbs color gamut triangle
        [colorPoints addObject:[self getValueFromPoint:CGPointMake(0.674F, 0.322F)]];     // Red
        [colorPoints addObject:[self getValueFromPoint:CGPointMake(0.408F, 0.517F)]];     // Green
        [colorPoints addObject:[self getValueFromPoint:CGPointMake(0.168F, 0.041F)]];     // Blue

    }
    else if ([livingColors containsObject:model]) {
        // LivingColors color gamut triangle
        [colorPoints addObject:[self getValueFromPoint:CGPointMake(0.703F, 0.296F)]];     // Red
        [colorPoints addObject:[self getValueFromPoint:CGPointMake(0.214F, 0.709F)]];     // Green
        [colorPoints addObject:[self getValueFromPoint:CGPointMake(0.139F, 0.081F)]];     // Blue
    }
    else {
        // Default construct triangle wich contains all values
        [colorPoints addObject:[self getValueFromPoint:CGPointMake(1.0F, 0.0F)]];         // Red
        [colorPoints addObject:[self getValueFromPoint:CGPointMake(0.0F, 1.0F)]];         // Green
        [colorPoints addObject:[self getValueFromPoint:CGPointMake(0.0F, 0.0F)]];         // Blue
    }

    return colorPoints;
}

+ (CGPoint)calculateXY:(UIColor *)color forModel:(NSString*)model {
    CGColorRef cgColor = [color CGColor];

    const CGFloat *components = CGColorGetComponents(cgColor);
    long numberOfComponents = CGColorGetNumberOfComponents(cgColor);

    // Default to white
    CGFloat red = 1.0f;
    CGFloat green = 1.0f;
    CGFloat blue = 1.0f;

    if (numberOfComponents == 4) {
        // Full color
        red = components[0];
        green = components[1];
        blue = components[2];
    }
    else if (numberOfComponents == 2) {
        // Greyscale color
        red = green = blue = components[0];
    }

    // Apply gamma correction
    float r = (red   > 0.04045f) ? pow((red   + 0.055f) / (1.0f + 0.055f), 2.4f) : (red   / 12.92f);
    float g = (green > 0.04045f) ? pow((green + 0.055f) / (1.0f + 0.055f), 2.4f) : (green / 12.92f);
    float b = (blue  > 0.04045f) ? pow((blue  + 0.055f) / (1.0f + 0.055f), 2.4f) : (blue  / 12.92f);

    // Wide gamut conversion D65
    float X = r * 0.664511f + g * 0.154324f + b * 0.162028f;
    float Y = r * 0.283881f + g * 0.668433f + b * 0.047685f;
    float Z = r * 0.000088f + g * 0.072310f + b * 0.986039f;

    float cx = X / (X + Y + Z);
    float cy = Y / (X + Y + Z);

    if (isnan(cx)) {
        cx = 0.0f;
    }

    if (isnan(cy)) {
        cy = 0.0f;
    }

    //Check if the given XY value is within the colourreach of our lamps.

    CGPoint xyPoint =  CGPointMake(cx,cy);
    NSArray *colorPoints = [self colorPointsForModel:model];
    BOOL inReachOfLamps = [self checkPointInLampsReach:xyPoint withColorPoints:colorPoints];

    if (!inReachOfLamps) {
        //It seems the colour is out of reach
        //let's find the closest colour we can produce with our lamp and send this XY value out.

        //Find the closest point on each line in the triangle.
        CGPoint pAB =[self getClosestPointToPoints:[self getPointFromValue:[colorPoints objectAtIndex:cptRED]] point2:[self getPointFromValue:[colorPoints objectAtIndex:cptGREEN]] point3:xyPoint];
        CGPoint pAC = [self getClosestPointToPoints:[self getPointFromValue:[colorPoints objectAtIndex:cptBLUE]] point2:[self getPointFromValue:[colorPoints objectAtIndex:cptRED]] point3:xyPoint];
        CGPoint pBC = [self getClosestPointToPoints:[self getPointFromValue:[colorPoints objectAtIndex:cptGREEN]] point2:[self getPointFromValue:[colorPoints objectAtIndex:cptBLUE]] point3:xyPoint];

        //Get the distances per point and see which point is closer to our Point.
        float dAB = [self getDistanceBetweenTwoPoints:xyPoint point2:pAB];
        float dAC = [self getDistanceBetweenTwoPoints:xyPoint point2:pAC];
        float dBC = [self getDistanceBetweenTwoPoints:xyPoint point2:pBC];

        float lowest = dAB;
        CGPoint closestPoint = pAB;

        if (dAC < lowest) {
            lowest = dAC;
            closestPoint = pAC;
        }
        if (dBC < lowest) {
            lowest = dBC;
            closestPoint = pBC;
        }

        //Change the xy value to a value which is within the reach of the lamp.
        cx = closestPoint.x;
        cy = closestPoint.y;
    }

    return CGPointMake(cx, cy);
}

/**
 * Calculates crossProduct of two 2D vectors / points.
 *
 * @param p1 first point used as vector
 * @param p2 second point used as vector
 * @return crossProduct of vectors
 */
+ (float)crossProduct:(CGPoint)p1 point2:(CGPoint)p2 {
    return (p1.x * p2.y - p1.y * p2.x);
}

/**
 * Find the closest point on a line.
 * This point will be within reach of the lamp.
 *
 * @param A the point where the line starts
 * @param B the point where the line ends
 * @param P the point which is close to a line.
 * @return the point which is on the line.
 */
+ (CGPoint)getClosestPointToPoints:(CGPoint)A point2:(CGPoint)B point3:(CGPoint)P {
    CGPoint AP = CGPointMake(P.x - A.x, P.y - A.y);
    CGPoint AB = CGPointMake(B.x - A.x, B.y - A.y);
    float ab2 = AB.x * AB.x + AB.y * AB.y;
    float ap_ab = AP.x * AB.x + AP.y * AB.y;

    float t = ap_ab / ab2;

    if (t < 0.0f) {
        t = 0.0f;
    }
    else if (t > 1.0f) {
        t = 1.0f;
    }

    CGPoint newPoint = CGPointMake(A.x + AB.x * t, A.y + AB.y * t);
    return newPoint;
}

/**
 * Find the distance between two points.
 *
 * @param one
 * @param two
 * @return the distance between point one and two
 */
+ (float)getDistanceBetweenTwoPoints:(CGPoint)one point2:(CGPoint)two {
    float dx = one.x - two.x; // horizontal difference
    float dy = one.y - two.y; // vertical difference
    float dist = sqrt(dx * dx + dy * dy);

    return dist;
}

/**
 * Method to see if the given XY value is within the reach of the lamps.
 *
 * @param p the point containing the X,Y value
 * @return true if within reach, false otherwise.
 */
+ (BOOL)checkPointInLampsReach:(CGPoint)p withColorPoints:(NSArray*)colorPoints {
    CGPoint red =   [self getPointFromValue:[colorPoints objectAtIndex:cptRED]];
    CGPoint green = [self getPointFromValue:[colorPoints objectAtIndex:cptGREEN]];
    CGPoint blue =  [self getPointFromValue:[colorPoints objectAtIndex:cptBLUE]];

    CGPoint v1 = CGPointMake(green.x - red.x, green.y - red.y);
    CGPoint v2 = CGPointMake(blue.x - red.x, blue.y - red.y);

    CGPoint q = CGPointMake(p.x - red.x, p.y - red.y);

    float s = [self crossProduct:q point2:v2] / [self crossProduct:v1 point2:v2];
    float t = [self crossProduct:v1 point2:q] / [self crossProduct:v1 point2:v2];

    if ( (s >= 0.0f) && (t >= 0.0f) && (s + t <= 1.0f)) {
        return true;
    }
    else {
        return false;
    }
}
```
