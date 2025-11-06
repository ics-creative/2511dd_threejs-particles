import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

const app = document.getElementById("app");
if (!app) {
  throw new Error("#app element not found");
}
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(devicePixelRatio);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000);

const camera = new THREE.PerspectiveCamera(
  55,
  innerWidth / innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 0, 20);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;

// Curl Noiseの実装
const noise = new SimplexNoise();
function curlNoise(x: number, y: number, z: number) {
  const e = 0.0001;

  // Noise field F
  const F = (x: number, y: number, z: number) =>
    new THREE.Vector3(
      noise.noise3d(y, z, x),
      noise.noise3d(z, x, y),
      noise.noise3d(x, y, z),
    );

  const F_x1 = F(x + e, y, z);
  const F_x2 = F(x - e, y, z);
  const F_y1 = F(x, y + e, z);
  const F_y2 = F(x, y - e, z);
  const F_z1 = F(x, y, z + e);
  const F_z2 = F(x, y, z - e);

  return new THREE.Vector3(
    (F_y1.z - F_y2.z - (F_z1.y - F_z2.y)) / (2 * e),
    (F_z1.x - F_z2.x - (F_x1.z - F_x2.z)) / (2 * e),
    (F_x1.y - F_x2.y - (F_y1.x - F_y2.x)) / (2 * e),
  );
}

// ====== Particles ======
const count = 3000;
const positions = new Float32Array(count * 3);

for (let i = 0; i < count; i++) {
  positions[i * 3] = THREE.MathUtils.randFloatSpread(30);
  positions[i * 3 + 1] = THREE.MathUtils.randFloatSpread(30);
  positions[i * 3 + 2] = THREE.MathUtils.randFloatSpread(30);
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const material = new THREE.PointsMaterial({
  color: 0x66ccff,
  size: 0.12,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
});

// Particle Texture
function makeCircleTexture(size = 64) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
material.map = makeCircleTexture();
material.needsUpdate = true;

const points = new THREE.Points(geometry, material);
scene.add(points);

// Post-process
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.8, // strength
  0.8, // radius
  0.0, // threshold
);
composer.addPass(bloom);

const afterimage = new AfterimagePass();
afterimage.uniforms["damp"].value = 0.86;
composer.addPass(afterimage);
composer.setSize(window.innerWidth, window.innerHeight);

// ====== Animation ======
function animate() {
  const pos = geometry.attributes.position.array;

  for (let i = 0; i < count; i++) {
    const ix = i * 3,
      iy = ix + 1,
      iz = ix + 2;

    const p = new THREE.Vector3(pos[ix], pos[iy], pos[iz]);
    const flow = curlNoise(p.x * 0.1, p.y * 0.1, p.z * 0.1);
    flow.multiplyScalar(0.003);

    pos[ix] += flow.x;
    pos[iy] += flow.y;
    pos[iz] += flow.z;

    if (p.length() > 25) {
      pos[ix] = THREE.MathUtils.randFloatSpread(20);
      pos[iy] = THREE.MathUtils.randFloatSpread(20);
      pos[iz] = THREE.MathUtils.randFloatSpread(20);
    }
  }

  geometry.attributes.position.needsUpdate = true;
  controls.update();
  composer.render();
  // renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// Resize
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});
