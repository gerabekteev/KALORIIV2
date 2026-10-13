import os
import math
from PIL import Image, ImageDraw

def hex_to_rgb(hex_str):
    hex_str = hex_str.lstrip('#')
    return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))

def bezier_point(p0, p1, p2, p3, t):
    it = 1.0 - t
    x = it**3 * p0[0] + 3 * it**2 * t * p1[0] + 3 * it * t**2 * p2[0] + t**3 * p3[0]
    y = it**3 * p0[1] + 3 * it**2 * t * p1[1] + 3 * it * t**2 * p2[1] + t**3 * p3[1]
    return (x, y)

def create_kalorii_icon(target_size: int, output_path: str):
    # Render at 4x target_size (at least 2048) for ultra-sharp anti-aliased result
    scale_factor = 4
    canvas_size = target_size * scale_factor
    svg_base_size = 512.0
    s = canvas_size / svg_base_size

    img = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))

    # 1. Background with rounded rectangle and gradient #18181b to #09090b
    bg_mask = Image.new('L', (canvas_size, canvas_size), 0)
    bg_draw = ImageDraw.Draw(bg_mask)
    radius = int(128 * s)
    bg_draw.rounded_rectangle([0, 0, canvas_size, canvas_size], radius=radius, fill=255)

    bg_grad = Image.new('RGBA', (canvas_size, canvas_size))
    c_start = (24, 24, 27)  # #18181b
    c_end = (9, 9, 11)      # #09090b

    # Diagonal gradient
    for y in range(canvas_size):
        for x in range(canvas_size):
            factor = (x + y) / (2.0 * canvas_size)
            r = int(c_start[0] + (c_end[0] - c_start[0]) * factor)
            g = int(c_start[1] + (c_end[1] - c_start[1]) * factor)
            b = int(c_start[2] + (c_end[2] - c_start[2]) * factor)
            bg_grad.putpixel((x, y), (r, g, b, 255))

    img.paste(bg_grad, (0, 0), bg_mask)

    # 2. Flame path
    commands = [
        ('M', (250, 50)),
        ('C', ((260, 150), (350, 200), (350, 300))),
        ('C', ((350, 380), (290, 450), (200, 450))),
        ('C', ((110, 450), (50, 380), (50, 300))),
        ('C', ((50, 220), (120, 160), (170, 110))),
        ('C', ((180, 180), (240, 210), (240, 260))),
        ('C', ((240, 290), (220, 310), (190, 310))),
        ('C', ((160, 310), (145, 290), (145, 270))),
        ('C', ((145, 240), (160, 220), (170, 200))),
        ('C', ((120, 240), (100, 280), (100, 320))),
        ('C', ((100, 380), (140, 410), (200, 410))),
        ('C', ((260, 410), (300, 360), (300, 290))),
        ('C', ((300, 210), (220, 160), (250, 50))),
    ]

    poly = []
    curr = (250, 50)
    for cmd, pts in commands:
        if cmd == 'M':
            curr = pts
            poly.append(curr)
        elif cmd == 'C':
            p1, p2, p3 = pts
            for step in range(1, 101):
                t = step / 100.0
                pt = bezier_point(curr, p1, p2, p3, t)
                poly.append(pt)
            curr = p3

    # Transform: translate(106, 86) scale(0.6) and then canvas scale `s`
    transformed_poly = []
    min_y = 1e9
    max_y = -1e9
    for x, y in poly:
        tx = (106.0 + x * 0.6) * s
        ty = (86.0 + y * 0.6) * s
        transformed_poly.append((tx, ty))
        if ty < min_y: min_y = ty
        if ty > max_y: max_y = ty

    flame_mask = Image.new('L', (canvas_size, canvas_size), 0)
    flame_mask_draw = ImageDraw.Draw(flame_mask)
    flame_mask_draw.polygon(transformed_poly, fill=255)

    # Gradient for flame: bottom #059669 -> middle #10b981 -> top #34d399
    c_bottom = hex_to_rgb('#059669')
    c_mid = hex_to_rgb('#10b981')
    c_top = hex_to_rgb('#34d399')

    flame_grad = Image.new('RGBA', (canvas_size, canvas_size))
    flame_draw = ImageDraw.Draw(flame_grad)

    y_span = max_y - min_y
    for y in range(int(min_y), int(max_y) + 1):
        if y < 0 or y >= canvas_size:
            continue
        rel = (y - min_y) / (y_span or 1.0) # 0 is top, 1 is bottom
        # SVG gradient: y1=100% (bottom) to y2=0% (top)
        # offset 0 (bottom): #059669
        # offset 50% (mid): #10b981
        # offset 100% (top): #34d399
        t_grad = 1.0 - rel
        if t_grad < 0.5:
            f = t_grad / 0.5
            r = int(c_bottom[0] + (c_mid[0] - c_bottom[0]) * f)
            g = int(c_bottom[1] + (c_mid[1] - c_bottom[1]) * f)
            b = int(c_bottom[2] + (c_mid[2] - c_bottom[2]) * f)
        else:
            f = (t_grad - 0.5) / 0.5
            r = int(c_mid[0] + (c_top[0] - c_mid[0]) * f)
            g = int(c_mid[1] + (c_top[1] - c_mid[1]) * f)
            b = int(c_mid[2] + (c_top[2] - c_mid[2]) * f)

        flame_draw.line([(0, y), (canvas_size, y)], fill=(r, g, b, 255))

    img.paste(flame_grad, (0, 0), flame_mask)

    # Downscale smoothly to target size
    final_img = img.resize((target_size, target_size), Image.Resampling.LANCZOS)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    final_img.save(output_path, format='PNG')
    print(f"Generated {output_path} ({target_size}x{target_size})")

if __name__ == '__main__':
    public_dir = r"c:\Fvus\some\KALORII\frontend\public"
    create_kalorii_icon(192, os.path.join(public_dir, "icon-192.png"))
    create_kalorii_icon(512, os.path.join(public_dir, "icon-512.png"))
    print("Done generating PWA icons!")
