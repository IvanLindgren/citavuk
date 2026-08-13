import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as THREE from 'three';
import { useEffect, useRef, useState } from 'react';

import { inScript, type Script } from '../travel/content';
import {
  loadTravelScene,
  STREET_OBJECTS,
  type StreetObject,
  type TravelSceneData,
} from '../travel/scene3d';

interface Props {
  cityId: string;
  script: Script;
  onPick: (object: StreetObject) => void;
  onReady: () => void;
  onError: () => void;
}

interface LabelRecord {
  element: HTMLButtonElement;
  anchor: THREE.Object3D;
  object: StreetObject;
}

const BUILDING_COLORS = [0xe8d7b4, 0xdcbda7, 0xc9c8ac, 0xbac8c2, 0xd9c78f];

export function TravelScene3D({ cityId, script, onPick, onReady, onError }: Props) {
  const [data, setData] = useState<TravelSceneData | null>(null);
  const errorHandler = useRef(onError);
  errorHandler.current = onError;

  useEffect(() => {
    let alive = true;
    setData(null);
    loadTravelScene(cityId).then(
      (loaded) => alive && setData(loaded),
      () => alive && errorHandler.current(),
    );
    return () => {
      alive = false;
    };
  }, [cityId]);

  return data ? (
    <SceneCanvas
      key={data.cityId}
      data={data}
      script={script}
      onPick={onPick}
      onReady={onReady}
      onError={onError}
    />
  ) : (
    <div className="absolute inset-0 bg-[#dce2cf]" />
  );
}

function SceneCanvas({
  data,
  script,
  onPick,
  onReady,
  onError,
}: {
  data: TravelSceneData;
  script: Script;
  onPick: (object: StreetObject) => void;
  onReady: () => void;
  onError: () => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const labelsLayer = useRef<HTMLDivElement | null>(null);
  const labels = useRef<LabelRecord[]>([]);
  const handlers = useRef({ onPick, onReady, onError });
  const scriptValue = useRef(script);
  handlers.current = { onPick, onReady, onError };
  scriptValue.current = script;

  useEffect(() => {
    for (const label of labels.current) {
      label.element.textContent = inScript(STREET_OBJECTS[label.object.kind].sr, script);
    }
  }, [script]);

  useEffect(() => {
    const container = holder.current;
    const overlay = labelsLayer.current;
    if (!container || !overlay) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      handlers.current.onError();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = 'travel-3d-canvas';
    renderer.domElement.setAttribute('aria-label', 'Трёхмерная карта города');
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdce2cf);
    scene.fog = new THREE.Fog(0xdce2cf, 460, 920);

    const camera = new THREE.PerspectiveCamera(42, 1, 1, 1800);
    camera.position.set(245, 220, 285);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 105;
    controls.maxDistance = 820;
    controls.minPolarAngle = 0.42;
    controls.maxPolarAngle = 1.34;
    controls.screenSpacePanning = false;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xeef4ff, 0x6f7354, 2.1));
    const sun = new THREE.DirectionalLight(0xfff2d2, 2.8);
    sun.position.set(-180, 340, 220);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(data.radiusM * 2.35, data.radiusM * 2.35),
      new THREE.MeshStandardMaterial({ color: 0x9fbd83, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.9;
    scene.add(ground);

    addRoads(scene, data);
    addBuildings(scene, data);

    const interactive: THREE.Object3D[] = [];
    const labelRecords: LabelRecord[] = [];
    for (const object of data.objects) {
      const model = streetObjectModel(object);
      model.group.position.set(object.at[0], 0, -object.at[1]);
      model.group.userData.streetObject = object;
      model.group.traverse((child) => {
        child.userData.streetObject = object;
        if (child instanceof THREE.Mesh) interactive.push(child);
      });
      scene.add(model.group);

      const anchor = new THREE.Object3D();
      anchor.position.set(0, model.labelHeight, 0);
      model.group.add(anchor);
      const element = document.createElement('button');
      element.type = 'button';
      element.className = `travel-3d-label travel-3d-label--${object.kind}`;
      element.textContent = inScript(STREET_OBJECTS[object.kind].sr, scriptValue.current);
      element.setAttribute('aria-label', `${STREET_OBJECTS[object.kind].sr} — ${STREET_OBJECTS[object.kind].ru}`);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        handlers.current.onPick(object);
      });
      overlay.appendChild(element);
      labelRecords.push({ element, anchor, object });
    }
    labels.current = labelRecords;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerStart: [number, number] | null = null;

    const pick = (event: PointerEvent) => {
      if (!pointerStart || Math.hypot(event.clientX - pointerStart[0], event.clientY - pointerStart[1]) > 7) {
        pointerStart = null;
        return;
      }
      pointerStart = null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(interactive, false)[0]?.object;
      const object = hit?.userData.streetObject as StreetObject | undefined;
      if (object) handlers.current.onPick(object);
    };
    renderer.domElement.addEventListener('pointerdown', (event) => {
      pointerStart = [event.clientX, event.clientY];
    });
    renderer.domElement.addEventListener('pointerup', pick);
    renderer.domElement.addEventListener('webglcontextlost', handlers.current.onError, { once: true });

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const projected = new THREE.Vector3();
    const updateLabels = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      const occupied = new Set<string>();
      const maxLabels = width < 600 ? 10 : 20;
      const kindCounts = new Map<string, number>();
      let shown = 0;
      const candidates = labelRecords
        .map((label) => {
          label.anchor.getWorldPosition(projected);
          const distance = projected.distanceTo(camera.position);
          const point = projected.clone().project(camera);
          return {
            ...label,
            distance,
            x: (point.x * 0.5 + 0.5) * width,
            y: (-point.y * 0.5 + 0.5) * height,
            visible: point.z > -1 && point.z < 1,
          };
        })
        .sort((left, right) => left.distance - right.distance);
      for (const label of candidates) {
        const cell = `${Math.round(label.x / 105)}:${Math.round(label.y / 38)}`;
        const kindCount = kindCounts.get(label.object.kind) ?? 0;
        const kindLimit = width < 600 ? 2 : label.object.kind === 'tree' ? 4 : 3;
        const visible = shown < maxLabels && kindCount < kindLimit && label.visible && label.x > 24 && label.x < width - 24 && label.y > 100 && label.y < height - 28 && !occupied.has(cell);
        label.element.hidden = !visible;
        if (!visible) continue;
        occupied.add(cell);
        kindCounts.set(label.object.kind, kindCount + 1);
        shown += 1;
        label.element.style.transform = `translate3d(${Math.round(label.x)}px,${Math.round(label.y)}px,0) translate(-50%,-100%)`;
      }
    };

    let frame = 0;
    let ready = false;
    const render = () => {
      frame = window.requestAnimationFrame(render);
      controls.update();
      renderer.render(scene, camera);
      updateLabels();
      if (!ready) {
        ready = true;
        renderer.domElement.dataset.sceneReady = 'true';
        handlers.current.onReady();
      }
    };
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      for (const label of labelRecords) label.element.remove();
      labels.current = [];
      renderer.domElement.remove();
    };
  }, [data]);

  return (
    <div className="absolute inset-0 z-0 isolate overflow-hidden bg-[#dce2cf]">
      <div ref={holder} className="absolute inset-0" />
      <div ref={labelsLayer} className="pointer-events-none absolute inset-0 overflow-hidden" />
      <p className="pointer-events-none absolute bottom-2 left-3 text-[10px] text-[#3e4b3b]/70">
        © OpenStreetMap contributors · ODbL
      </p>
    </div>
  );
}

function addRoads(scene: THREE.Scene, data: TravelSceneData) {
  const material = new THREE.MeshStandardMaterial({ color: 0xd7c9aa, roughness: 1 });
  for (const road of data.roads) {
    for (let index = 1; index < road.points.length; index += 1) {
      const start = road.points[index - 1]!;
      const end = road.points[index]!;
      const dx = end[0] - start[0];
      const dz = -(end[1] - start[1]);
      const length = Math.hypot(dx, dz);
      if (length < 1) continue;
      const segment = new THREE.Mesh(new THREE.BoxGeometry(length + 1, 0.7, road.width), material);
      segment.position.set((start[0] + end[0]) / 2, -0.25, -(start[1] + end[1]) / 2);
      segment.rotation.y = -Math.atan2(dz, dx);
      scene.add(segment);
    }
  }
}

function addBuildings(scene: THREE.Scene, data: TravelSceneData) {
  for (const building of data.buildings) {
    if (building.outline.length < 4) continue;
    const shape = new THREE.Shape();
    building.outline.forEach((point, index) => {
      if (index === 0) shape.moveTo(point[0], point[1]);
      else shape.lineTo(point[0], point[1]);
    });
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: building.height, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    const color = BUILDING_COLORS[hash(building.id) % BUILDING_COLORS.length]!;
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.02 }),
    );
    scene.add(mesh);
  }
}

function streetObjectModel(object: StreetObject): { group: THREE.Group; labelHeight: number } {
  const group = new THREE.Group();
  const shade = (hash(object.id) % 20) / 100;
  const material = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.82 });
  const add = (geometry: THREE.BufferGeometry, color: number, position: [number, number, number], rotation?: [number, number, number]) => {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  };

  switch (object.kind) {
    case 'tree':
      add(new THREE.CylinderGeometry(0.7, 1.1, 6, 7), 0x73533b, [0, 3, 0]);
      add(new THREE.IcosahedronGeometry(4.3 + shade * 4, 1), 0x3f7956, [0, 8.5, 0]);
      add(new THREE.IcosahedronGeometry(3.2, 1), 0x6a9b5b, [2.2, 8, 0.8]);
      return { group, labelHeight: 13 };
    case 'bench':
      add(new THREE.BoxGeometry(8, 0.8, 2), 0x8f5f3d, [0, 2.2, 0]);
      add(new THREE.BoxGeometry(8, 3.5, 0.55), 0x9f6a43, [0, 4, 1]);
      add(new THREE.BoxGeometry(0.55, 2.2, 0.55), 0x41494b, [-2.7, 1, 0]);
      add(new THREE.BoxGeometry(0.55, 2.2, 0.55), 0x41494b, [2.7, 1, 0]);
      return { group, labelHeight: 7 };
    case 'street_lamp':
      add(new THREE.CylinderGeometry(0.35, 0.5, 10, 8), 0x3f484a, [0, 5, 0]);
      add(new THREE.SphereGeometry(1.35, 12, 8), 0xf0c764, [0, 10.5, 0]);
      return { group, labelHeight: 13 };
    case 'fountain':
      add(new THREE.CylinderGeometry(5.2, 5.8, 1.2, 18), 0xc2b79f, [0, 0.6, 0]);
      add(new THREE.CylinderGeometry(4.4, 4.4, 0.35, 18), 0x62b9cf, [0, 1.28, 0]);
      add(new THREE.CylinderGeometry(0.45, 0.7, 4.5, 10), 0xb9ae95, [0, 3.2, 0]);
      add(new THREE.SphereGeometry(0.9, 12, 8), 0x8fd8e5, [0, 5.8, 0]);
      return { group, labelHeight: 8 };
    case 'bus_stop':
      add(new THREE.BoxGeometry(9, 0.5, 3.5), 0xb54338, [0, 8, 0]);
      add(new THREE.BoxGeometry(0.5, 8, 0.5), 0x41494b, [-3.8, 4, 0]);
      add(new THREE.BoxGeometry(0.5, 8, 0.5), 0x41494b, [3.8, 4, 0]);
      add(new THREE.BoxGeometry(5, 4, 0.35), 0x7aaeba, [0, 5, 1.45]);
      return { group, labelHeight: 11 };
    case 'waste_basket':
      add(new THREE.CylinderGeometry(1.5, 1.8, 3.4, 10), 0x455b53, [0, 1.7, 0]);
      add(new THREE.CylinderGeometry(1.75, 1.75, 0.3, 10), 0x2d3a36, [0, 3.5, 0]);
      return { group, labelHeight: 6 };
    case 'bicycle_parking':
      for (const x of [-2.5, 0, 2.5]) {
        add(new THREE.TorusGeometry(1.5, 0.28, 7, 16, Math.PI), 0x536b78, [x, 0.2, 0], [0, 0, 0]);
      }
      return { group, labelHeight: 5 };
    case 'artwork':
      add(new THREE.BoxGeometry(3.5, 1.2, 3.5), 0xc6b38c, [0, 0.6, 0]);
      add(new THREE.CylinderGeometry(0.8, 1.2, 5, 7), 0x9f5748, [0, 3.6, 0]);
      add(new THREE.IcosahedronGeometry(2, 1), 0xc6a34f, [0, 7, 0]);
      return { group, labelHeight: 10 };
  }
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) >>> 0;
  return result;
}
