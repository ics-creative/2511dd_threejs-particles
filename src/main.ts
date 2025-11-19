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
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 0, 20);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.8;

const noise = new SimplexNoise();
// 三次元のベクトル場を作成
function sampleVectorField(x: number, y: number, z: number) {
  return new THREE.Vector3(
    noise.noise3d(y, z, x),
    noise.noise3d(z, x, y),
    noise.noise3d(x, y, z),
  );
}

// 三次元ベクトル場の回転成分を近似で求める
function curlNoise(x: number, y: number, z: number) {
  const e = 0.0001;
  // パーティクル付近の6点をサンプリング
  const fx1 = sampleVectorField(x + e, y, z);
  const fx2 = sampleVectorField(x - e, y, z);
  const fy1 = sampleVectorField(x, y + e, z);
  const fy2 = sampleVectorField(x, y - e, z);
  const fz1 = sampleVectorField(x, y, z + e);
  const fz2 = sampleVectorField(x, y, z - e);

  // 回転成分を計算
  return new THREE.Vector3(
    (fy1.z - fy2.z - (fz1.y - fz2.y)) / (2 * e),
    (fz1.x - fz2.x - (fx1.z - fx2.z)) / (2 * e),
    (fx1.y - fx2.y - (fy1.x - fy2.x)) / (2 * e),
  );
}

// パーティクルの初期化
const count = 2400;
const range = 24;
const positions = new Float32Array(count * 3);

for (let i = 0; i < count; i++) {
  positions[i * 3] = THREE.MathUtils.randFloatSpread(range);
  positions[i * 3 + 1] = THREE.MathUtils.randFloatSpread(range);
  positions[i * 3 + 2] = THREE.MathUtils.randFloatSpread(range);
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
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2D rendering context");
  }
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
// UnrealBloomPass (光のぼかし）
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.8,
  0.8,
  0.0,
);
composer.addPass(bloom);

// AfterimagePass (光の残像)
const afterimage = new AfterimagePass();
afterimage.uniforms.damp.value = 0.86;
composer.addPass(afterimage);

composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(window.innerWidth, window.innerHeight);

const noiseScale = 0.1;
const flowStrength = 0.003;
// パーティクルをアニメーションさせる
function animate() {
  const pos = geometry.attributes.position.array;

  for (let i = 0; i < count; i++) {
    const ix = i * 3;
    // Curl Noiseのベクトル場flowをパーティクルの位置に加算
    const p = new THREE.Vector3(pos[ix], pos[ix + 1], pos[ix + 2]);
    const flow = curlNoise(
      p.x * noiseScale,
      p.y * noiseScale,
      p.z * noiseScale,
    );
    flow.multiplyScalar(flowStrength);
    pos[ix] += flow.x;
    pos[ix + 1] += flow.y;
    pos[ix + 2] += flow.z;

    // パーティクルがrangeよりも離れたら位置をリセット
    if (p.length() > 2 * range) {
      pos[ix] = THREE.MathUtils.randFloatSpread(range);
      pos[ix + 1] = THREE.MathUtils.randFloatSpread(range);
      pos[ix + 2] = THREE.MathUtils.randFloatSpread(range);
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
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);
});
