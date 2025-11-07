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

// バッファ用
const p = new THREE.Vector3();
const flow = new THREE.Vector3();

// レンダラーの作成
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

// シーンの作成
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000);

// カメラの作成
const camera = new THREE.PerspectiveCamera(
  75,
  innerWidth / innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 0, 20);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;

// Curl Noiseの実装
const noise = new SimplexNoise();
const Fx1 = new THREE.Vector3();
const Fx2 = new THREE.Vector3();
const Fy1 = new THREE.Vector3();
const Fy2 = new THREE.Vector3();
const Fz1 = new THREE.Vector3();
const Fz2 = new THREE.Vector3();

function sampleF(x: number, y: number, z: number, out: THREE.Vector3) {
  out.set(
    noise.noise3d(y, z, x),
    noise.noise3d(z, x, y),
    noise.noise3d(x, y, z),
  );
  return out;
}

function curlNoise(x: number, y: number, z: number, out: THREE.Vector3) {
  const e = 1e-4;
  sampleF(x + e, y, z, Fx1);
  sampleF(x - e, y, z, Fx2);
  sampleF(x, y + e, z, Fy1);
  sampleF(x, y - e, z, Fy2);
  sampleF(x, y, z + e, Fz1);
  sampleF(x, y, z - e, Fz2);

  out.set(
    (Fy1.z - Fy2.z - (Fz1.y - Fz2.y)) / (2 * e),
    (Fz1.x - Fz2.x - (Fx1.z - Fx2.z)) / (2 * e),
    (Fx1.y - Fx2.y - (Fy1.x - Fy2.x)) / (2 * e),
  );
  return out;
}

// パーティクルの初期化
const count = 2400;
const spreadRange = 24;
const positions = new Float32Array(count * 3);

for (let i = 0; i < count; i++) {
  positions[i * 3] = THREE.MathUtils.randFloatSpread(spreadRange);
  positions[i * 3 + 1] = THREE.MathUtils.randFloatSpread(spreadRange);
  positions[i * 3 + 2] = THREE.MathUtils.randFloatSpread(spreadRange);
}

// ジオメトリの作成
const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const material = new THREE.PointsMaterial({
  color: 0x66ccff,
  size: 0.12,
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
});

// パーティクルのテクスチャを作成
function makeCircleTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  // グラデーションのある円
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, "rgba(255, 255, 255, 1)"); // 内側の円：不透明な白
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)"); // 外側の円：透明
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}
material.map = makeCircleTexture();
material.needsUpdate = true;

const points = new THREE.Points(geometry, material);
scene.add(points);

// ポストプロセス処理
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
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(window.innerWidth, window.innerHeight);

// パーティクルをアニメーションさせる
function animate() {
  const pos = geometry.attributes.position.array;

  for (let i = 0; i < count; i++) {
    const ix = i * 3;

    // Curl Noiseのベクトル場flowをパーティクルの位置に加算
    p.set(pos[ix], pos[ix + 1], pos[ix + 2]);
    curlNoise(p.x * 0.1, p.y * 0.1, p.z * 0.1, flow);
    flow.multiplyScalar(0.003);
    pos[ix] += flow.x;
    pos[ix + 1] += flow.y;
    pos[ix + 2] += flow.z;

    // パーティクルがspreadRangeよりも離れたら位置をリセット
    if (p.length() > 30) {
      pos[ix] = THREE.MathUtils.randFloatSpread(spreadRange);
      pos[ix + 1] = THREE.MathUtils.randFloatSpread(spreadRange);
      pos[ix + 2] = THREE.MathUtils.randFloatSpread(spreadRange);
    }
  }

  geometry.attributes.position.needsUpdate = true;
  controls.update();
  composer.render();
  requestAnimationFrame(animate);
}

animate();

// ウィンドウリサイズ時の処理
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
});
