// ============================================================
// 环抱你 · 小白 — true 3D character enclosure
//
// The electronics are hidden inside a rounded humanoid torso.
// A 56 x 83 mm half breadboard mounts vertically in the belly.
// This is not a decorated box: every external silhouette is character form.
// ============================================================

show = "assembled";
$fn = 96;
$fn_arm = 72;

// ---------- Minimum electronics envelope ----------
cavity_w = 62; // half breadboard width + tolerance
cavity_d = 32; // original 32 mm component/wiring depth
cavity_h = 90; // 83 mm breadboard + end clearance
cavity_z = 62;
wall = 2.4;
fit_tol = 0.35;

// Hand interaction: clear slot between belly and forearms. A palm slides in
// from below/front, presses MAX30102, and is gently hugged at both edges.
hand_clearance = 22;

// ---------- Existing functional interfaces (sizes unchanged) ----------
usb_port_w = 11;
usb_port_h = 6;
usb_center_spacing = 13;
usb_center_z = -2;
esp_board_l = 63.3;
esp_board_w = 27.9;
esp_plane_y = 9;

wire_hole_d = 9;
wire_hole_gap = 14;
wire_hole_z = 50;

max_bw = 15.5;
max_bl = 20;
max_recess_d = 1.2;
max_open_w = 17;
max_bridge_w = 4.5;
max_slot_l = 20;
max_z = 72;

mpu_bw = 16;
mpu_bl = 21;
mpu_recess_d = 1.2;
mpu_slot_w = 5;
mpu_slot_l = 22;
mpu_edge_off = 5;
mpu_z = 82;

// Flat sensor bosses: a small platform stands proud of the curved belly so the
// board + pin header seat squarely and every opening penetrates cleanly.
max_face_y = 45;   // front MAX30102 boss outer flat face (belly ~43.4 here)
mpu_face_y = -39;  // back  MPU6050  boss outer flat face (belly ~-37.6 here)

// ============================================================
// Primitives
module ellipsoid(pos, radii, fn = $fn) {
  translate(pos) scale(radii) sphere(r = 1, $fn = fn);
}

module rounded_box(size, r, center = true) {
  sx = size[0]; sy = size[1]; sz = size[2];
  translate(center ? [0, 0, 0] : [sx / 2, sy / 2, sz / 2])
    hull()
      for (x = [-sx / 2 + r, sx / 2 - r])
        for (y = [-sy / 2 + r, sy / 2 - r])
          for (z = [-sz / 2 + r, sz / 2 - r])
            translate([x, y, z]) sphere(r = r, $fn = 28);
}

module capsule_2d(len, width) {
  hull() {
    translate([-len / 2, 0]) circle(d = width);
    translate([ len / 2, 0]) circle(d = width);
  }
}

module rounded_plate(w, d, h, r, pos) {
  translate(pos)
    hull()
      for (x = [-w / 2 + r, w / 2 - r])
        for (z = [-h / 2 + r, h / 2 - r])
          translate([x, 0, z])
            rotate([90, 0, 0]) cylinder(h = d, r = r, center = true, $fn = 28);
}

module heart_2d(w, h) {
  scale([w / 28, h / 28])
    union() {
      hull() {
        translate([-6.3, 5]) circle(r = 7.2, $fn = 36);
        translate([0, -10]) circle(r = 1.2, $fn = 24);
      }
      hull() {
        translate([6.3, 5]) circle(r = 7.2, $fn = 36);
        translate([0, -10]) circle(r = 1.2, $fn = 24);
      }
    }
}

module heart_plate(w, d, h, pos) {
  translate(pos)
    rotate([90, 0, 0])
      linear_extrude(d, center = true)
        heart_2d(w, h);
}

function unit(v) = v / norm(v);
function bezier3(p0, p1, p2, p3, t) =
  p0 * pow(1 - t, 3) +
  p1 * (3 * pow(1 - t, 2) * t) +
  p2 * (3 * (1 - t) * t * t) +
  p3 * (t * t * t);

function arm_center(s, t, palm_y) =
  t <= 0.5
    ? let(u = t * 2,
          p = bezier3([38, 4, 98], [54, 7, 91], [61, 17, 73], [56, 32, 66], u))
      [s * p[0], p[1], p[2]]
    : let(u = (t - 0.5) * 2,
          p = bezier3([56, 32, 66], [55, 47, 61], [47, palm_y - 3, 66], [36, palm_y, 73], u))
      [s * p[0], p[1], p[2]];

function arm_radius(t) =
  12.6 - 2.4 * t + max(0, 1.9 * (1 - abs(t - 0.5) / 0.18));

// A true continuous swept mesh. Unlike adjacent sphere hulls, this produces
// no conical section boundaries along the arm.
module smooth_arm_tube(s, palm_y, steps = 28, sides = 28) {
  centers = [for (i = [0 : steps]) arm_center(s, i / steps, palm_y)];
  tangents = [
    for (i = [0 : steps])
      unit(i == 0
        ? centers[1] - centers[0]
        : i == steps
          ? centers[steps] - centers[steps - 1]
          : centers[i + 1] - centers[i - 1])
  ];
  normals = [for (t = tangents) unit(cross(t, [0, 0, 1]))];
  binormals = [for (i = [0 : steps]) unit(cross(normals[i], tangents[i]))];

  ring_vertices = [
    for (i = [0 : steps])
      for (j = [0 : sides - 1])
        let(a = 360 * j / sides,
            r = arm_radius(i / steps))
          centers[i] + r * (cos(a) * normals[i] + sin(a) * binormals[i])
  ];
  start_center = len(ring_vertices);
  end_center = start_center + 1;
  side_faces = [
    for (i = [0 : steps - 1])
      for (j = [0 : sides - 1])
        each [
          [i * sides + j,
           i * sides + (j + 1) % sides,
           (i + 1) * sides + (j + 1) % sides],
          [i * sides + j,
           (i + 1) * sides + (j + 1) % sides,
           (i + 1) * sides + j]
        ]
  ];
  cap_faces = concat(
    [for (j = [0 : sides - 1]) [start_center, (j + 1) % sides, j]],
    [for (j = [0 : sides - 1])
      [end_center, steps * sides + j, steps * sides + (j + 1) % sides]]
  );

  polyhedron(points = concat(ring_vertices, [centers[0], centers[steps]]),
             faces = concat(side_faces, cap_faces),
             convexity = 12);
}

// Smooth Catmull-Rom body profile sampled densely before rotate_extrude.
// [radius, z] pairs; no planar front/back/side surfaces exist in this body.
body_profile = [
  [10.000,-5.000],[11.312,-4.585],[13.055,-4.086],[15.130,-3.497],
  [17.438,-2.812],[19.878,-2.026],[22.352,-1.133],[24.759,-0.126],
  [27.000,1.000],[29.180,2.235],[31.438,3.570],[33.727,5.011],
  [36.000,6.562],[38.211,8.231],[40.312,10.023],[42.258,11.944],
  [44.000,14.000],[45.542,16.201],[46.930,18.547],[48.181,21.025],
  [49.312,23.625],[50.343,26.334],[51.289,29.141],[52.169,32.033],
  [53.000,35.000],[53.794,38.122],[54.539,41.445],[55.218,44.905],
  [55.812,48.438],[56.306,51.978],[56.680,55.461],[56.917,58.823],
  [57.000,62.000],[56.903,65.003],[56.633,67.898],[56.218,70.704],
  [55.688,73.438],[55.071,76.116],[54.398,78.758],[53.698,81.380],
  [53.000,84.000],[52.289,86.657],[51.531,89.352],[50.727,92.042],
  [49.875,94.688],[48.977,97.247],[48.031,99.680],[47.039,101.944],
  [46.000,104.000],[44.935,105.826],[43.852,107.453],[42.733,108.916],
  [41.562,110.250],[40.321,111.490],[38.992,112.672],[37.558,113.830],
  [36.000,115.000],[34.314,116.178],[32.516,117.328],[30.615,118.439],
  [28.625,119.500],[26.557,120.498],[24.422,121.422],[22.232,122.260],
  [20.000,123.000],[17.555,123.635],[14.812,124.172],[11.914,124.623],
  [9.000,125.000],[6.211,125.314],[3.688,125.578],[1.570,125.803],
  [0.000,126.000]
];

// ============================================================
// Organic character volumes
module torso_outer() {
  // One continuous surface of revolution, then gently flattened front/back.
  // This gives a low round belly and narrow shoulders with continuous curvature.
  translate([0, 2, 0])
    scale([1, 0.74, 1])
      rotate_extrude(convexity = 10, $fn = 128)
        polygon(points = concat([[0, -5]], body_profile));
}

module torso_inner() {
  // Scaled organic core. Pushed closer to 1.0 to thin the belly shell from
  // ~4 mm to ~2.8 mm (large print-time/material save) while extremities stay
  // >=1.5 mm. wall_check must remain empty (electronics + 2.4 mm still fit).
  translate([0, 2, 62])
    scale([0.95, 0.935, 0.95])
      translate([0, -2, -62]) torso_outer();
}

module electronics_cavity(extra = 0) {
  translate([0, 2, cavity_z])
    rounded_box([cavity_w + 2 * extra,
                 cavity_d + 2 * extra,
                 cavity_h + 2 * extra],
                4 + extra);
}

module esp32_bay(extra = 0) {
  // Vertical lower-belly bay. PCB long axis follows Z, with the two Type-C
  // connectors on the short edge pointing straight down between the feet.
  translate([0, esp_plane_y, 27])
    rounded_box([32 + 2 * extra, 10 + 2 * extra, 64 + 2 * extra], 2 + extra);
}

module all_electronics_clearance(extra = 0) {
  union() {
    electronics_cavity(extra);
    esp32_bay(extra);
  }
}

module head_outer() {
  union() {
    // Faceless and earless: identity comes entirely from the embrace gesture.
    ellipsoid([0, 0, 134], [19, 16, 14.5]);
    ellipsoid([0, 0, 121.5], [8.5, 8.5, 6], 40);
  }
}

module head() {
  head_outer();
}

module head_inner() {
  ellipsoid([0, -1, 134], [16, 13, 11.5]);
}

module arm(s) {
  // The round shoulder starts in the narrow upper body. A distinct spherical
  // elbow turns the forearm inward, forming a true C-shaped side silhouette.
  belly_front_at_palm = 32;
  palm_y = belly_front_at_palm + hand_clearance + 10.5;
  union() {
    smooth_arm_tube(s, palm_y);
    // Hidden shoulder peg takes the load when a hand presses into the hug.
    translate([s * 38, 10, 98])
      rotate([90, 0, 0]) cylinder(h = 12, d = 7.4, $fn = 40);
    // Palms remain at the user's left/right hand edges, leaving the sensor
    // and central palm area unobstructed. Thumb sits on the upper-inner side.
    ellipsoid([s * 36, palm_y + 1, 73], [11, 10, 10.5], $fn_arm);
    ellipsoid([s * 28.5, palm_y + 2, 78], [5.2, 5, 5.8], 48);
  }
}

module arms() {
  arm(-1);
  arm(1);
}

module feet() {
  // Wide stance leaves the two underside Type-C openings unobstructed.
  ellipsoid([-30, 5, 5], [17, 22, 10], 48);
  ellipsoid([ 30, 5, 5], [17, 22, 10], 48);
}

module character_core_outer() {
  union() {
    torso_outer();
    head();
    feet();
  }
}

module character_solid() {
  union() {
    torso_outer();
    head();
    arms();
    feet();
  }
}

// Front sensor boss: a flat platform proud of the curved belly. Its outer
// face sits at max_face_y so the MAX30102 seats square, not on a curve.
module sensor_pads() {
  translate([0, max_face_y - 5, max_z])
    rounded_box([24, 10, 28], 3.5);
}

module max30102_cuts() {
  // Board seat recess (1.2 mm deep from the flat boss face).
  translate([0, max_face_y - max_recess_d / 2 + 0.01, max_z])
    rounded_box([max_bw + 2, max_recess_d + 0.02, max_bl + 2], 0.8);

  // 工-shape: two slots + 4.5 mm central support bridge. Each slot runs from
  // the boss face all the way through the shell into the hollow interior so
  // the pins/underside clear cleanly (previously capped ~1.4 mm short).
  sw = (max_open_w - max_bridge_w) / 2;
  for (side = [-1, 1]) {
    cx = side * (max_bridge_w / 2 + sw / 2);
    translate([cx, max_face_y - 13, max_z])   // y: 45 -> 19, full penetration
      cube([sw, 26, max_slot_l], center = true);
  }
}

module mpu6050_back_cuts() {
  // Board seat recess on the back boss face.
  translate([0, mpu_face_y + mpu_recess_d / 2 - 0.01, mpu_z])
    rounded_box([mpu_bw + 2, mpu_recess_d + 0.02, mpu_bl + 2], 0.8);

  // 一字: a single straight slot along the pin-header edge, penetrating the
  // boss face through the shell into the hollow interior.
  translate([mpu_edge_off, mpu_face_y + 13, mpu_z])  // y: -39 -> -13
    cube([mpu_slot_w, 26, mpu_slot_l], center = true);
}

module front_function_cuts() {
  max30102_cuts();
  usb_cuts();
}

module back_sensor_pad() {
  translate([0, mpu_face_y + 5, mpu_z])
    rounded_box([25, 10, 29], 3.5);
}

module usb_cuts() {
  // True underside access. Port width runs along X, height along Y.
  for (dx = [-usb_center_spacing / 2, usb_center_spacing / 2])
    translate([dx, esp_plane_y, usb_center_z])
      cube([usb_port_w, usb_port_h, 18], center = true);
}

module wire_cuts() {
  for (dx = [-wire_hole_gap / 2, wire_hole_gap / 2])
    translate([dx, -44, wire_hole_z])
      rotate([-90, 0, 0]) cylinder(h = 28, d = wire_hole_d, $fn = 36);
}

module back_function_cuts() {
  wire_cuts();
  mpu6050_back_cuts();
}

module breadboard_guides() {
  // 56.4 mm clear width; breadboard back rests against the rear shell.
  for (x = [-29.45, 29.45])
    translate([x, -25.0, cavity_z]) cube([2.5, 26.6, 86], center = true);
  translate([0, -25.0, 16.8]) cube([57.8, 26.6, 2.5], center = true);
}

module esp32_guides() {
  // Two side rails + top stop for a 27.9 x 57.2 mm vertical PCB.
  for (x = [-esp_board_w / 2 - 1.4, esp_board_w / 2 + 1.4])
    translate([x, 23.0, 30])
      cube([2.4, 33, 60], center = true);
  translate([0, 23.0, 60.2])
    cube([esp_board_w + 5, 33, 2.4], center = true);
}

module breadboard_guides_inside_body() {
  // Guide stock may be rectangular for reliable printing, but none of it is
  // allowed to break through the character's continuous outer surface.
  intersection() {
    breadboard_guides();
    torso_outer();
  }
}

module esp32_guides_inside_body() {
  intersection() {
    esp32_guides();
    torso_outer();
  }
}

// ============================================================
// Two torso shell halves: the seam follows the body's side profile at y=0.
module torso_hollow() {
  difference() {
    character_core_outer();
    torso_inner();
    head_inner();
  }
}

module body_front_raw() {
  intersection() {
    union() {
      torso_hollow();
      sensor_pads();
      esp32_guides_inside_body();
    }
    translate([-90, 0, -10]) cube([180, 90, 180]);
  }
}

module body_back_raw() {
  intersection() {
    union() {
      torso_hollow();
      back_sensor_pad();
    }
    translate([-90, -90, -10]) cube([180, 90, 180]);
  }
}

// Alignment posts are outside the electronics envelope.
module alignment_posts() {
  for (x = [-35, 35])
    for (z = [35, 88])
      union() {
        // A narrow radial rib ties the snap to the rear organic shell.  The
        // rib sits outside the 62 mm electronics envelope, so it adds snap
        // strength without filling the useful cavity again.
        hull() {
          translate([x, -26.0, z]) sphere(d = 5.5, $fn = 28);
          translate([x,  -1.8, z]) sphere(d = 5.5, $fn = 28);
        }
        translate([x, -1.8, z])
          rotate([-90, 0, 0]) cylinder(h = 3.7, d = 4.6, $fn = 36);
        translate([x, 2.0, z]) sphere(d = 5.8, $fn = 40);
      }
}

module alignment_holes() {
  for (x = [-35, 35])
    for (z = [35, 88])
      union() {
        // Narrow mouth flexes as the 5.8 mm ball passes, then retains it.
        translate([x, 1.1, z])
          rotate([90, 0, 0]) cylinder(h = 3.2, d = 5.0, $fn = 36);
        translate([x, 2.0, z]) sphere(d = 6.2 + fit_tol, $fn = 40);
        // Relief slots let the surrounding PLA deflect instead of cracking.
        for (dx = [-3.7, 3.7])
          translate([x + dx, 0, z - 4]) cube([0.8, 7, 8]);
      }
}

module arm_socket_holes() {
  for (s = [-1, 1])
    translate([s * 38, 11, 98])
      rotate([90, 0, 0]) cylinder(h = 14, d = 7.4 + fit_tol * 2, $fn = 40);
}

module engrave_text() {
  // 「环抱你」 debossed on the lower-front chest, below the MAX30102 boss.
  // Extrudes from just outside the belly surface inward (-Y) so the cut depth
  // stays even across the mild curvature. Fill with a paint pen for colour.
  translate([0, 46, 52])
    rotate([90, 0, 0])
      linear_extrude(height = 5)
        mirror([1, 0, 0])
          text("环抱你", size = 5.5, font = "Heiti SC",
               halign = "center", valign = "center", spacing = 1.05);
}

module body_front() {
  difference() {
    body_front_raw();
    alignment_holes();
    arm_socket_holes();
    front_function_cuts();
    engrave_text();
  }
}

module body_back() {
  difference() {
    union() {
      body_back_raw();
      alignment_posts();
      breadboard_guides_inside_body();
    }
    back_function_cuts();
  }
}

// ============================================================
// Preview / first-stage verification
module assembled() {
  color("#F8F7F2") body_front();
  color("#ECEBE6") body_back();
  color("#F5F3ED") arms();
}

module cavity_check() {
  color("#F8F7F2", 0.55) torso_outer();
  color("#6BAA75") all_electronics_clearance();
}

module wall_check() {
  // Any output means a functional clearance does not fit inside the new
  // organic hollow core (ignoring the intentional underside USB opening).
  intersection() {
    difference() {
      all_electronics_clearance(wall);
      torso_inner();
    }
    translate([-100, -100, 5]) cube([200, 200, 195]);
  }
}

module palm_mock() {
  // Average palm proxy used only to verify the hug gap; not a printed part.
  color("#D8B49A", 0.75)
    translate([0, 51, 70]) rounded_box([56, 20, 62], 9);
}

module grip_check() {
  assembled();
  palm_mock();
}

module arm_print(s) {
  if (s > 0)
    translate([-58, 8, 75]) rotate([0, 90, 0]) arm(s);
  else
    translate([99, 8, 75]) rotate([0, -90, 0]) arm(s);
}

module print_layout() {
  translate([3, 0, 0]) {
    // Both shell halves lie on their flat seam planes.
    translate([55, 150, 0]) rotate([90, 0, 0]) body_front();
    translate([172, 5, 4.9]) rotate([-90, 0, 0]) body_back();
    // Curved arms lie on their broad side and need only local support.
    translate([10, 160, 0]) arm_print(1);
    translate([75, 160, 0]) arm_print(-1);
  }
}

if      (show == "assembled")    assembled();
else if (show == "solid")        character_solid();
else if (show == "body_front")   body_front();
else if (show == "body_back")    body_back();
else if (show == "lid")          body_front(); // legacy filename alias
else if (show == "tray")         body_back();  // legacy filename alias
else if (show == "head")         head();
else if (show == "arm")          arm(1);
else if (show == "arm_l")        arm(-1);
else if (show == "arms")         arms();
else if (show == "feet")         feet();
else if (show == "cavity")       electronics_cavity();
else if (show == "cavity_check") cavity_check();
else if (show == "wall_check")   wall_check();
else if (show == "grip_check")   grip_check();
else if (show == "print")        print_layout();
else assembled();
