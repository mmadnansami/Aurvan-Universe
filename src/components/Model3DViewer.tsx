import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Download,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Sun,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

type LightingPreset = 'FORENSIC' | 'WARM_STUDIO' | 'HIGH_CONTRAST';

const LIGHTING_PRESETS: Record<
  LightingPreset,
  {
    label: string;
    bg: number;
    keyColor: number;
    keyIntensity: number;
    hemiSky: number;
    hemiGround: number;
    hemiIntensity: number;
    rimColor: number;
    rimIntensity: number;
    exposure: number;
  }
> = {
  FORENSIC: {
    label: 'Forensic Lab',
    bg: 0x09101c,
    keyColor: 0xfff5e4,
    keyIntensity: 2.1,
    hemiSky: 0xaec8ff,
    hemiGround: 0x111722,
    hemiIntensity: 0.9,
    rimColor: 0x7cb8ff,
    rimIntensity: 1.0,
    exposure: 1.08,
  },
  WARM_STUDIO: {
    label: 'Warm Studio',
    bg: 0x100e14,
    keyColor: 0xffdfba,
    keyIntensity: 2.4,
    hemiSky: 0xd9c6b0,
    hemiGround: 0x1a1512,
    hemiIntensity: 0.85,
    rimColor: 0xc9a45c,
    rimIntensity: 1.15,
    exposure: 1.12,
  },
  HIGH_CONTRAST: {
    label: 'High Contrast',
    bg: 0x05070c,
    keyColor: 0xffffff,
    keyIntensity: 2.7,
    hemiSky: 0x7a96c2,
    hemiGround: 0x080a0f,
    hemiIntensity: 0.65,
    rimColor: 0xe2e8f0,
    rimIntensity: 1.4,
    exposure: 1.05,
  },
};

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function disposeObject3D(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (mat) {
      const mats = Array.isArray(mat) ? mat : [mat];
      for (const m of mats) {
        const record = m as unknown as Record<string, unknown>;
        for (const val of Object.values(record)) {
          if (val && typeof val === 'object' && 'isTexture' in val && (val as THREE.Texture).isTexture) {
            (val as THREE.Texture).dispose();
          }
        }
        m.dispose();
      }
    }
  });
}

export interface Model3DViewerProps {
  modelUrl: string;
  title?: string;
  format?: 'GLB' | 'GLTF';
  heightClass?: string;
  onFallbackToStandard?: () => void;
  fallbackLabel?: string;
  allowDownload?: boolean;
}

export function Model3DViewer({
  modelUrl,
  title = '3D Evidence Model',
  format = 'GLB',
  heightClass = 'h-[360px] sm:h-[440px]',
  onFallbackToStandard,
  fallbackLabel = 'Switch to Standard View',
  allowDownload = true,
}: Model3DViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [turntable, setTurntable] = useState<boolean>(false);
  const [preset, setPreset] = useState<LightingPreset>('FORENSIC');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [expandedFallback, setExpandedFallback] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [modelStats, setModelStats] = useState<{ meshes: number; triangles: number } | null>(null);

  // Refs for imperative controls without re-mounting renderer
  const turntableRef = useRef<boolean>(false);
  const requestRenderRef = useRef<() => void>(() => {});
  const resetCameraRef = useRef<() => void>(() => {});
  const zoomStepRef = useRef<(factor: number) => void>(() => {});
  const applyPresetRef = useRef<(p: LightingPreset) => void>(() => {});
  const resizeSceneRef = useRef<() => void>(() => {});
  const onFallbackRef = useRef(onFallbackToStandard);

  useEffect(() => {
    onFallbackRef.current = onFallbackToStandard;
  }, [onFallbackToStandard]);

  const hasLoadedRef = useRef<boolean>(false);

  useEffect(() => {
    turntableRef.current = turntable;
    if (hasLoadedRef.current) requestRenderRef.current();
  }, [turntable]);

  useEffect(() => {
    applyPresetRef.current(preset);
    if (hasLoadedRef.current) requestRenderRef.current();
  }, [preset]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      setTimeout(() => resizeSceneRef.current(), 60);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    setTimeout(() => resizeSceneRef.current(), 40);
  }, [expandedFallback]);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount || !modelUrl) return;

    let disposed = false;
    let frameId = 0;
    let timerId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let loadedRoot: THREE.Object3D | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let lastTickMs = performance.now();
    hasLoadedRef.current = false;

    setStatus('loading');
    setLoadProgress(0);
    setErrorMsg('');
    setModelStats(null);

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setStatus('error');
      setErrorMsg('WebGL 3D context could not be initialized on this device.');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = LIGHTING_PRESETS.FORENSIC.exposure;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';

    mount.innerHTML = '';
    mount.appendChild(renderer.domElement);

    const width = Math.max(mount.clientWidth || 640, 320);
    const height = Math.max(mount.clientHeight || 380, 240);
    renderer.setSize(width, height, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(LIGHTING_PRESETS.FORENSIC.bg);
    scene.fog = new THREE.FogExp2(LIGHTING_PRESETS.FORENSIC.bg, 0.045);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 200);
    camera.position.set(2.4, 1.65, 2.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = true;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 0.65;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    // Three-point forensic lighting rig
    const hemiLight = new THREE.HemisphereLight(
      LIGHTING_PRESETS.FORENSIC.hemiSky,
      LIGHTING_PRESETS.FORENSIC.hemiGround,
      LIGHTING_PRESETS.FORENSIC.hemiIntensity
    );
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(
      LIGHTING_PRESETS.FORENSIC.keyColor,
      LIGHTING_PRESETS.FORENSIC.keyIntensity
    );
    keyLight.position.set(3.5, 5.2, 3.8);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 20;
      keyLight.shadow.camera.left = -2.5;
      keyLight.shadow.camera.right = 2.5;
      keyLight.shadow.camera.top = 2.5;
      keyLight.shadow.camera.bottom = -2.5;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(
      LIGHTING_PRESETS.FORENSIC.rimColor,
      LIGHTING_PRESETS.FORENSIC.rimIntensity
    );
    rimLight.position.set(-3.2, 2.8, -3.5);
    scene.add(rimLight);

    // Inspection stage & contact shadow
    const pedestalGroup = new THREE.Group();
    const grid = new THREE.GridHelper(6, 16, 0x334155, 0x162032);
    grid.position.y = -0.005;
    pedestalGroup.add(grid);

    const shadowTex = createContactShadowTexture();
    const contactDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1.45, 48),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.72,
      })
    );
    contactDisc.rotation.x = -Math.PI / 2;
    contactDisc.position.y = 0.004;
    pedestalGroup.add(contactDisc);

    if (!isSoftwareGl) {
      const shadowReceiver = new THREE.Mesh(
        new THREE.CircleGeometry(3, 48),
        new THREE.ShadowMaterial({ opacity: 0.35 })
      );
      shadowReceiver.rotation.x = -Math.PI / 2;
      shadowReceiver.position.y = 0.001;
      shadowReceiver.receiveShadow = true;
      pedestalGroup.add(shadowReceiver);
    }

    scene.add(pedestalGroup);

    const defaultCamPos = new THREE.Vector3(2.3, 1.45, 2.6);
    const defaultTarget = new THREE.Vector3(0, 0.55, 0);

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        timerId = window.setTimeout(cb, 80);
        return;
      }
      const startMs = performance.now();
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED && performance.now() - startMs < 250) {
          timerId = window.setTimeout(poll, 10);
        } else {
          if (sync) gl.deleteSync(sync);
          timerId = window.setTimeout(cb, 80);
        }
      };
      timerId = window.setTimeout(poll, 10);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const nowMs = performance.now();
        const delta = Math.min(Math.max((nowMs - lastTickMs) / 1000, 0), 0.1);
        lastTickMs = nowMs;
        if (mixer) {
          mixer.update(delta);
        }
        if (turntableRef.current && loadedRoot) {
          loadedRoot.rotation.y += isSoftwareGl ? 0.06 : delta * 0.65;
        }
        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (!disposed && (renderDirty || turntableRef.current || Boolean(mixer))) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    }

    requestRenderRef.current = requestRender;

    resetCameraRef.current = () => {
      camera.position.copy(defaultCamPos);
      controls.target.copy(defaultTarget);
      if (loadedRoot) {
        loadedRoot.rotation.y = 0;
      }
      controls.update();
      requestRender();
    };

    zoomStepRef.current = (factor: number) => {
      const offset = camera.position.clone().sub(controls.target);
      const nextDist = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
      offset.setLength(nextDist);
      camera.position.copy(controls.target).add(offset);
      controls.update();
      requestRender();
    };

    applyPresetRef.current = (nextPreset: LightingPreset) => {
      const cfg = LIGHTING_PRESETS[nextPreset];
      scene.background = new THREE.Color(cfg.bg);
      scene.fog = new THREE.FogExp2(cfg.bg, 0.045);
      keyLight.color.setHex(cfg.keyColor);
      keyLight.intensity = cfg.keyIntensity;
      hemiLight.color.setHex(cfg.hemiSky);
      hemiLight.groundColor.setHex(cfg.hemiGround);
      hemiLight.intensity = cfg.hemiIntensity;
      rimLight.color.setHex(cfg.rimColor);
      rimLight.intensity = cfg.rimIntensity;
      renderer.toneMappingExposure = cfg.exposure;
      if (hasLoadedRef.current) requestRender();
    };

    const handleResize = () => {
      if (disposed || !mount) return;
      const w = Math.max(mount.clientWidth, 240);
      const h = Math.max(mount.clientHeight, 200);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      if (hasLoadedRef.current) requestRender();
    };
    resizeSceneRef.current = handleResize;

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mount);
    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', () => {
      if (turntableRef.current) {
        setTurntable(false);
      }
    });

    // Load GLB / GLTF asset
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (disposed) {
          disposeObject3D(gltf.scene);
          return;
        }
        const model = gltf.scene;
        let meshCount = 0;
        let triCount = 0;

        model.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            meshCount += 1;
            const geo = mesh.geometry;
            if (geo) {
              if (!geo.attributes.normal) {
                geo.computeVertexNormals();
              }
              triCount += geo.index
                ? Math.round(geo.index.count / 3)
                : Math.round((geo.attributes.position?.count || 0) / 3);
            }
            if (!isSoftwareGl) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
            }
          }
        });

        // Normalize model dimensions and center bottom on pedestal y = 0
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
        const center = box.isEmpty() ? new THREE.Vector3(0, 0.5, 0) : box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const scale = 1.4 / maxDim;

        const wrapper = new THREE.Group();
        model.position.set(-center.x, box.isEmpty() ? 0 : -box.min.y, -center.z);
        wrapper.add(model);
        wrapper.scale.setScalar(scale);

        const scaledSize = size.clone().multiplyScalar(scale);
        const scaledHeight = scaledSize.y;
        const sphereRadius = Math.max(scaledSize.length() * 0.5, 0.45);
        const halfFovRad = THREE.MathUtils.degToRad(camera.fov * 0.5);
        const fitDistance = (sphereRadius / Math.sin(halfFovRad)) * 1.38;
        const viewDir = new THREE.Vector3(0.64, 0.42, 0.72).normalize();

        defaultTarget.set(0, Math.max(scaledHeight * 0.48, 0.2), 0);
        defaultCamPos.copy(defaultTarget).addScaledVector(viewDir, fitDistance);
        controls.minDistance = Math.max(fitDistance * 0.35, 0.5);
        controls.maxDistance = Math.max(fitDistance * 4.5, 14);

        loadedRoot = wrapper;
        scene.add(wrapper);

        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          gltf.animations.forEach((clip) => mixer?.clipAction(clip).play());
        }

        camera.position.copy(defaultCamPos);
        controls.target.copy(defaultTarget);
        controls.update();

        if (!isSoftwareGl) {
          renderer.compile(scene, camera);
        }

        hasLoadedRef.current = true;
        setModelStats({ meshes: meshCount, triangles: triCount });
        setStatus('ready');
        setLoadProgress(100);
        requestRender();
      },
      (evt) => {
        if (disposed) return;
        if (evt.total > 0) {
          setLoadProgress(Math.min(99, Math.round((evt.loaded / evt.total) * 100)));
        }
      },
      (err) => {
        if (disposed) return;
        console.error('GLTF load error:', err);
        setStatus('error');
        setErrorMsg('Failed to decode 3D GLB/GLTF geometry. The file may be corrupted or unsupported.');
      }
    );

    return () => {
      disposed = true;
      hasLoadedRef.current = false;
      cancelAnimationFrame(frameId);
      clearTimeout(timerId);
      resizeObserver.disconnect();
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      if (loadedRoot) {
        disposeObject3D(loadedRoot);
      }
      disposeObject3D(pedestalGroup);
      envTex.dispose();
      renderer.dispose();
      mount.innerHTML = '';
    };
  }, [modelUrl]);

  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      setExpandedFallback(false);
      return;
    }
    if (el.requestFullscreen) {
      try {
        await el.requestFullscreen();
      } catch {
        setExpandedFallback((prev) => !prev);
      }
    } else {
      setExpandedFallback((prev) => !prev);
    }
  }, []);

  const cyclePreset = useCallback(() => {
    setPreset((prev) => {
      if (prev === 'FORENSIC') return 'WARM_STUDIO';
      if (prev === 'WARM_STUDIO') return 'HIGH_CONTRAST';
      return 'FORENSIC';
    });
  }, []);

  const wrapperClass = expandedFallback
    ? 'fixed inset-3 z-50 flex flex-col rounded-lg border border-slate-700 bg-[#09101C] overflow-hidden shadow-2xl'
    : `relative flex flex-col rounded-lg border border-slate-800 bg-[#09101C] overflow-hidden ${
        isFullscreen ? 'h-screen w-screen' : heightClass
      }`;

  return (
    <div
      ref={containerRef}
      data-testid="model-3d-viewer"
      data-status={status}
      className={wrapperClass}
    >
      {/* Dedicated WebGL Mount Container (never covered by blur filters) */}
      <div
        ref={canvasMountRef}
        className="relative flex-1 min-h-0 min-w-0 w-full h-full overflow-hidden cursor-grab active:cursor-grabbing select-none"
      />

      {/* Minimal Top-Left Specimen Badge */}
      <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap items-center gap-2">
        <span className="rounded border border-slate-700 bg-[#070B13]/90 px-2.5 py-1 text-[11px] font-mono-tabular text-[#C9A45C]">
          3D {format} INSPECTOR
        </span>
        {title && (
          <span className="rounded border border-slate-800 bg-[#070B13]/90 px-2.5 py-1 text-[11px] text-slate-200 max-w-[220px] truncate">
            {title}
          </span>
        )}
        {modelStats && (
          <span className="hidden sm:inline-block rounded border border-slate-800 bg-[#070B13]/90 px-2.5 py-1 text-[11px] font-mono-tabular text-slate-400">
            {modelStats.meshes} mesh{modelStats.meshes === 1 ? '' : 'es'} · {modelStats.triangles.toLocaleString()} tris
          </span>
        )}
      </div>

      {/* Loading State Overlay */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070B13]/85 text-center px-4">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#C9A45C] border-t-transparent mb-3" />
          <p className="text-xs font-medium text-white">
            Loading 3D Geometry... {loadProgress > 0 ? `${loadProgress}%` : ''}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Preparing PBR lighting, reflections, and interactive orbit controls
          </p>
        </div>
      )}

      {/* Error State with Standard View Fallback */}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#070B13]/95 text-center p-6 space-y-3">
          <AlertTriangle className="h-8 w-8 text-amber-400" />
          <div className="space-y-1 max-w-md">
            <p className="text-sm font-semibold text-white">3D Model Unavailable</p>
            <p className="text-xs text-slate-300">{errorMsg}</p>
          </div>
          {onFallbackToStandard && (
            <button
              type="button"
              onClick={onFallbackToStandard}
              className="rounded-md bg-[#C9A45C] px-4 py-2 text-xs font-semibold text-[#070B13] hover:bg-[#D8B774]"
            >
              {fallbackLabel}
            </button>
          )}
        </div>
      )}

      {/* Unified Collapsible Bottom Control Dock (Zero Center Occlusion) */}
      {status === 'ready' && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-24px)] max-w-[700px] flex flex-col items-center">
          <button
            type="button"
            onClick={() => setDockCollapsed((prev) => !prev)}
            className="pointer-events-auto mb-1 inline-flex items-center gap-1 rounded-t-md border border-b-0 border-slate-700 bg-[#0B111E]/95 px-2.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="h-3 w-3" />
                <span>Show 3D Controls</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3" />
                <span>Hide Controls</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-[#0B111E]/95 px-2.5 py-1.5 shadow-xl">
              <button
                type="button"
                onClick={() => zoomStepRef.current(0.8)}
                aria-label="Zoom in 3D model"
                title="Zoom In"
                className="inline-flex items-center gap-1 rounded border border-slate-800 bg-[#070B13] px-2 py-1 text-[11px] text-slate-200 hover:border-slate-600"
              >
                <ZoomIn className="h-3.5 w-3.5 text-[#C9A45C]" />
                <span className="hidden sm:inline">Zoom +</span>
              </button>

              <button
                type="button"
                onClick={() => zoomStepRef.current(1.25)}
                aria-label="Zoom out 3D model"
                title="Zoom Out"
                className="inline-flex items-center gap-1 rounded border border-slate-800 bg-[#070B13] px-2 py-1 text-[11px] text-slate-200 hover:border-slate-600"
              >
                <ZoomOut className="h-3.5 w-3.5 text-[#C9A45C]" />
                <span className="hidden sm:inline">Zoom -</span>
              </button>

              <button
                type="button"
                onClick={() => resetCameraRef.current()}
                aria-label="Reset 3D camera"
                title="Reset View"
                className="inline-flex items-center gap-1 rounded border border-slate-800 bg-[#070B13] px-2 py-1 text-[11px] text-slate-200 hover:border-slate-600"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>

              <button
                type="button"
                onClick={() => setTurntable((prev) => !prev)}
                aria-pressed={turntable}
                title="Toggle 360 Turntable"
                className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors ${
                  turntable
                    ? 'border-[#C9A45C] bg-[#C9A45C] text-[#070B13] font-semibold'
                    : 'border-slate-800 bg-[#070B13] text-slate-200 hover:border-slate-600'
                }`}
              >
                <RotateCw className="h-3.5 w-3.5" />
                <span>360°</span>
              </button>

              <button
                type="button"
                onClick={cyclePreset}
                title="Cycle Lighting Rig"
                className="inline-flex items-center gap-1 rounded border border-slate-800 bg-[#070B13] px-2 py-1 text-[11px] text-slate-200 hover:border-slate-600"
              >
                <Sun className="h-3.5 w-3.5 text-[#C9A45C]" />
                <span>{LIGHTING_PRESETS[preset].label}</span>
              </button>

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="Toggle 3D fullscreen"
                title="Fullscreen"
                className="inline-flex items-center gap-1 rounded border border-slate-800 bg-[#070B13] px-2 py-1 text-[11px] text-slate-200 hover:border-slate-600"
              >
                {isFullscreen || expandedFallback ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>

              {allowDownload && (
                <a
                  href={modelUrl}
                  download={`${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'model'}.${format.toLowerCase()}`}
                  aria-label="Download 3D model file"
                  title={`Export ${format}`}
                  className="inline-flex items-center gap-1 rounded border border-slate-800 bg-[#070B13] px-2 py-1 text-[11px] text-slate-200 hover:border-slate-600"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{format}</span>
                </a>
              )}

              {onFallbackToStandard && (
                <button
                  type="button"
                  onClick={onFallbackToStandard}
                  className="inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-800"
                >
                  <span>Standard View</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
