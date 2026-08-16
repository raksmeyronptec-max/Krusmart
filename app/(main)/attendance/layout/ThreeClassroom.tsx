'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/actions/Button'
import { Badge, ATTENDANCE_BADGE, ATTENDANCE_COLORS } from '@/components/ui/feedback/Badge'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { logger } from '@/lib/utils/logger'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { Student } from '@/lib/types'

const cachedModels: Record<string, THREE.Group> = {};
const isLoadingModel: Record<string, boolean> = {};
const modelLoadCallbacks: Record<string, ((model: THREE.Group) => void)[]> = { male: [], female: [] };

function loadStudentModel(gender: string, callback: (model: THREE.Group) => void) {
    const isFemale = (gender === 'ស្រី' || gender === 'Female' || gender === 'F');
    const type = isFemale ? 'female' : 'male';
    
    if (cachedModels[type]) {
        callback(cachedModels[type]);
        return;
    }
    
    modelLoadCallbacks[type].push(callback);
    if (isLoadingModel[type]) return;
    isLoadingModel[type] = true;

    const loader = new GLTFLoader();
    const url = isFemale ? '/models/student_female.glb' : '/models/student_male.glb';
    
    loader.load(url, (gltf) => {
        cachedModels[type] = gltf.scene;
        isLoadingModel[type] = false;
        modelLoadCallbacks[type].forEach(cb => cb(cachedModels[type]));
        modelLoadCallbacks[type] = [];
    }, undefined, (error) => {
        logger.error(`Error loading ${type} student model`, error);
        isLoadingModel[type] = false;
    });
}

/** A 2-D point in either screen or NDC space. */
interface Point2 {
    x: number;
    y: number;
}

/** Seat-grid dimensions, mirroring the `config` state in `AttendanceLayoutClient`. */
interface ClassroomConfig {
    totalTables: number;
    gridCols: number;
    seatsPerTable: number;
    layout: string;
}

/** date → student id → mark. */
type AttendanceHistory = Record<string, Record<string, { status: string; note: string }>>;

interface ThreeClassroomProps {
    config: ClassroomConfig;
    seatingLayout: Record<string, string>;
    students: Student[];
    attendanceHistory: AttendanceHistory;
    date: string;
    onSeatClick: (seatId: string) => void;
    onClose: () => void;
}

/** A billboarded name tag floating above a seat. */
interface SeatLabel {
    sprite: THREE.Sprite;
    draw: (hex: string) => void;
}

/** Everything needed to recolour and hit-test one seat. */
interface SeatObject {
    uid: string;
    cushionMat: THREE.MeshStandardMaterial;
    label: SeatLabel;
    hitbox: THREE.Mesh;
}

/** Orbit camera position in spherical coordinates. */
interface OrbitPosition {
    r: number;
    theta: number;
    phi: number;
}

/**
 * Mutable scene state parked on a ref so the render loop can read it without
 * re-running the setup effect.
 */
interface ThreeState {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    worldGroup: THREE.Group;
    clock: THREE.Clock;
    raycaster: THREE.Raycaster;
    camTarget: THREE.Vector3;
    /** Eased current position; `tgt` is where it is heading. */
    cur: OrbitPosition;
    tgt: OrbitPosition;
    /** Baseline orbit radius, used to clamp zoom. */
    R0: number;
    ROOM_W: number;
    ROOM_D: number;
    clickable: THREE.Object3D[];
    seatObjects: Record<string, SeatObject>;
    deskGroups: THREE.Group[];
    propsRef: {
        config: ClassroomConfig;
        seatingLayout: Record<string, string>;
        students: Student[];
        attendanceHistory: AttendanceHistory;
        date: string;
    };
    animReq: number | null;
    autoSpin: boolean;
    destroyed: boolean;
    firstBuild: boolean;
    labelsVisible: boolean;
    revealStart: number;
}

/**
 * WebGL materials take a numeric colour, so the 3D view cannot read a CSS token.
 * It shares `ATTENDANCE_COLORS` with the 2D seating plan instead, which is what
 * keeps a "present" seat the same green in both.
 */
const STATUS3 = {
    P: { color: ATTENDANCE_COLORS.P.three, hex: ATTENDANCE_COLORS.P.hex },
    L: { color: ATTENDANCE_COLORS.L.three, hex: ATTENDANCE_COLORS.L.hex },
    A: { color: ATTENDANCE_COLORS.A.three, hex: ATTENDANCE_COLORS.A.hex }
};
const easeOutBack3 = (x: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

const DESK_D3 = 0.72, DESK_H3 = 0.74, TOP_T3 = 0.06, CHAIR_S3 = 0.46, SEAT_H3 = 0.46, SEAT_SP3 = 0.86;

function MAT3(color: number, opts: THREE.MeshStandardMaterialParameters = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...opts }); }
/** Release the GPU resources held by `root` and everything under it. */
function disposeObject3D(root: THREE.Object3D) {
    root.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        node.geometry?.dispose();
        const materials: THREE.Material[] = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach(material => {
            const textured = material as THREE.MeshStandardMaterial;
            textured.map?.dispose();
            material.dispose();
        });
    });
}

function box3(w: number, h: number, dp: number, mat: THREE.Material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dp), mat);
    m.castShadow = true; m.receiveShadow = true; return m;
}

export default function ThreeClassroom({ config, seatingLayout, students, attendanceHistory, date, onSeatClick, onClose }: ThreeClassroomProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [stats, setStats] = useState({ p: 0, l: 0, a: 0 })
    const [current3DView, setCurrent3DView] = useState('teacher')
    const [labelsVisible, setLabelsVisible] = useState(true)
    const [autoSpin, setAutoSpin] = useState(false)
    const [loading, setLoading] = useState(true)

    // ThreeJS state
    // Populated by the setup effect below before anything reads it.
    const threeState = useRef<ThreeState>({} as ThreeState)

    useEffect(() => {
        if (!canvasRef.current) return

        const canvas = canvasRef.current
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(window.innerWidth, window.innerHeight)
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.05

        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0xdfe8f2)
        scene.fog = new THREE.Fog(0xdfe8f2, 40, 78)

        const camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 250)
        const raycaster = new THREE.Raycaster()
        const clock = new THREE.Clock()
        const camTarget = new THREE.Vector3(0, 0.7, 0)
        const worldGroup = new THREE.Group()
        scene.add(worldGroup)

        scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb0c4, 0.85))
        const sun = new THREE.DirectionalLight(0xfff4e0, 0.95)
        sun.position.set(9, 16, 7)
        sun.castShadow = true
        sun.shadow.mapSize.set(2048, 2048)
        sun.shadow.camera.near = 1
        sun.shadow.camera.far = 70
        const d = 18; sun.shadow.camera.left = -d; sun.shadow.camera.right = d; sun.shadow.camera.top = d; sun.shadow.camera.bottom = -d; sun.shadow.bias = -0.0004;
        scene.add(sun)
        const fill = new THREE.DirectionalLight(0xbcd2ff, 0.25); fill.position.set(-8, 6, -6); scene.add(fill)

        threeState.current = {
            renderer, scene, camera, raycaster, clock, camTarget, worldGroup,
            cur: { r: 18, phi: 0.62, theta: 0.62 },
            tgt: { r: 18, phi: 0.62, theta: 0.62 },
            R0: 18, ROOM_W: 14, ROOM_D: 14,
            seatObjects: {}, clickable: [], deskGroups: [],
            labelsVisible: true, autoSpin: false,
            firstBuild: true, revealStart: 0,
            animReq: null,
            destroyed: false,
            propsRef: { config, seatingLayout, students, attendanceHistory, date } // Initial
        }

        const ts = threeState.current

        // Controls
        const pointers = new Map();
        let mode: string | null = null, last: Point2 | null = null, down: Point2 | null = null, moved = false, pinch = 0, mid: Point2 | null = null, hovered: string | null = null;
        const dist = (a: Point2, b: Point2) => Math.hypot(a.x - b.x, a.y - b.y);
        const midp = (a: Point2, b: Point2): Point2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        const ndc = (e: PointerEvent) => new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
        const clampPhi = () => { ts.tgt.phi = Math.max(0.16, Math.min(1.45, ts.tgt.phi)); }
        const clampR = () => { ts.tgt.r = Math.max(ts.R0 * 0.45, Math.min(ts.R0 * 1.9, ts.tgt.r)); }
        const panBy = (dx: number, dy: number) => {
            const f = ts.cur.r * 0.0016;
            const fwd = new THREE.Vector3().subVectors(ts.camTarget, ts.camera.position); fwd.y = 0; fwd.normalize();
            const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
            ts.camTarget.addScaledVector(right, dx * f); ts.camTarget.addScaledVector(fwd, dy * f);
            ts.camTarget.x = Math.max(-ts.ROOM_W / 2, Math.min(ts.ROOM_W / 2, ts.camTarget.x));
            ts.camTarget.z = Math.max(-ts.ROOM_D / 2, Math.min(ts.ROOM_D / 2, ts.camTarget.z));
        }
        
        canvas.addEventListener('pointerdown', (e: PointerEvent) => {
            canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.size === 1) { down = { x: e.clientX, y: e.clientY }; moved = false; last = { x: e.clientX, y: e.clientY }; mode = (e.button === 2 || e.shiftKey) ? 'pan' : 'rotate'; }
            else if (pointers.size === 2) { const p = Array.from(pointers.values()); pinch = dist(p[0], p[1]); mid = midp(p[0], p[1]); mode = 'pinch'; }
            setAutoSpin(false)
        });
        canvas.addEventListener('pointermove', (e: PointerEvent) => {
            if (!pointers.has(e.pointerId)) {
                ts.raycaster.setFromCamera(ndc(e), ts.camera);
                const hit = ts.raycaster.intersectObjects(ts.clickable, false)[0];
                const id = hit ? hit.object.userData.seatId : null;
                canvas.style.cursor = id ? 'pointer' : 'grab';
                if (id !== hovered) {
                    if (hovered && ts.seatObjects[hovered]) ts.seatObjects[hovered].cushionMat.emissiveIntensity = 0.22;
                    hovered = id; if (id && ts.seatObjects[id]) ts.seatObjects[id].cushionMat.emissiveIntensity = 0.55;
                }
                return;
            }
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (pointers.size === 1 && mode !== 'pinch') {
                if (!last || !down) return;
                const p = { x: e.clientX, y: e.clientY }, dx = p.x - last.x, dy = p.y - last.y;
                if (Math.abs(p.x - down.x) + Math.abs(p.y - down.y) > 7) moved = true;
                if (mode === 'rotate') { ts.tgt.theta -= dx * 0.005; ts.tgt.phi -= dy * 0.005; clampPhi(); } else panBy(-dx, dy);
                last = p;
            } else if (pointers.size === 2) {
                const p = Array.from(pointers.values()), dd = dist(p[0], p[1]), mm = midp(p[0], p[1]);
                if (pinch) { ts.tgt.r *= pinch / dd; clampR(); } if (mid) panBy(-(mm.x - mid.x), (mm.y - mid.y));
                pinch = dd; mid = mm; moved = true;
            }
        });
        const end = (e: PointerEvent) => {
            const wasOne = pointers.size === 1; pointers.delete(e.pointerId);
            if (pointers.size < 2) { pinch = 0; mid = null; }
            if (pointers.size === 1) { const p = Array.from(pointers.values())[0]; last = { x: p.x, y: p.y }; mode = 'rotate'; }
            if (pointers.size === 0) {
                if (wasOne && !moved) { 
                    ts.raycaster.setFromCamera(ndc(e), ts.camera); 
                    const hit = ts.raycaster.intersectObjects(ts.clickable, false)[0]; 
                    if (hit) onSeatClick(hit.object.userData.seatId); 
                }
                mode = null;
            }
        }
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
        canvas.addEventListener('contextmenu', (e: Event) => { e.preventDefault(); });
        canvas.addEventListener('wheel', (e: WheelEvent) => { e.preventDefault(); ts.tgt.r *= (1 + Math.sign(e.deltaY) * 0.08); clampR(); setAutoSpin(false); }, { passive: false });

        const handleResize = () => {
            ts.camera.aspect = window.innerWidth / window.innerHeight; 
            ts.camera.updateProjectionMatrix(); 
            ts.renderer.setSize(window.innerWidth, window.innerHeight);
        }
        window.addEventListener('resize', handleResize)

        let lastFrameTime = 0;
        const animate = (time: number = performance.now()) => {
            if (ts.destroyed) return;
            ts.animReq = requestAnimationFrame(animate);
            
            // Cap at 30 FPS to prevent excessive CPU/GPU usage and overheating
            if (time - lastFrameTime < 33) return;
            lastFrameTime = time;

            const t = ts.clock.getElapsedTime();
            if (ts.firstBuild) {
                let done = true;
                ts.deskGroups.forEach(g => {
                    const local = Math.max(0, Math.min(1, (t - ts.revealStart - g.userData.delay) / 0.55));
                    if (local < 1) done = false;
                    g.scale.setScalar(local >= 1 ? 1 : Math.max(0.001, easeOutBack3(local)));
                });
                if (done && ts.deskGroups.length) ts.firstBuild = false;
            }
            for (const id in ts.seatObjects) { const sp = ts.seatObjects[id].label.sprite; sp.position.y = sp.userData.baseY + Math.sin(t * 1.6) * 0.012; }
            if (ts.autoSpin) ts.tgt.theta += 0.0026;
            ts.cur.r += (ts.tgt.r - ts.cur.r) * 0.10; ts.cur.phi += (ts.tgt.phi - ts.cur.phi) * 0.12; ts.cur.theta += (ts.tgt.theta - ts.cur.theta) * 0.12;
            const sp = Math.sin(ts.cur.phi);
            ts.camera.position.set(ts.camTarget.x + ts.cur.r * sp * Math.sin(ts.cur.theta), ts.camTarget.y + ts.cur.r * Math.cos(ts.cur.phi), ts.camTarget.z + ts.cur.r * sp * Math.cos(ts.cur.theta));
            ts.camera.lookAt(ts.camTarget); ts.renderer.render(ts.scene, ts.camera);
        }
        
        rebuild3D(ts)
        animate()
        setLoading(false)

        return () => {
            ts.destroyed = true
            if (ts.animReq !== null) cancelAnimationFrame(ts.animReq)
            window.removeEventListener('resize', handleResize)
            // Cleanup threejs objects
            disposeObject3D(ts.worldGroup)
            ts.renderer.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time imperative scene setup; live props are read through `ts.propsRef`
    }, [])

    // Update props ref and trigger updates
    useEffect(() => {
        const ts = threeState.current
        if (!ts.renderer) return
        
        const oldProps = ts.propsRef
        ts.propsRef = { config, seatingLayout, students, attendanceHistory, date }

        if (JSON.stringify(oldProps.config) !== JSON.stringify(config) || JSON.stringify(oldProps.seatingLayout) !== JSON.stringify(seatingLayout)) {
            rebuild3D(ts)
        } else {
            // Just update colors
            update3DColors(ts)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild3D/update3DColors are stable module-scope helpers; the listed props are the real triggers
    }, [config, seatingLayout, students, attendanceHistory, date])

    useEffect(() => {
        if (!threeState.current.renderer) return
        threeState.current.autoSpin = autoSpin
    }, [autoSpin])

    useEffect(() => {
        if (!threeState.current.renderer) return
        threeState.current.labelsVisible = labelsVisible
        for (const id in threeState.current.seatObjects) {
            threeState.current.seatObjects[id].label.sprite.visible = labelsVisible
        }
    }, [labelsVisible])

    useEffect(() => {
        if (!threeState.current.renderer) return
        const ts = threeState.current
        if (current3DView === 'top') { ts.tgt.theta = 0.001; ts.tgt.phi = 0.30; ts.tgt.r = ts.R0 * 0.95; }
        else if (current3DView === 'teacher') { ts.tgt.theta = Math.PI; ts.tgt.phi = 1.02; ts.tgt.r = ts.R0; }
        else { ts.tgt.theta = 0.0; ts.tgt.phi = 1.02; ts.tgt.r = ts.R0; }
    }, [current3DView])


    // Helpers
    const getStatus3 = (ts: ThreeState, uid: string) => {
        const { attendanceHistory, date } = ts.propsRef
        return (attendanceHistory[date] && attendanceHistory[date][uid] && attendanceHistory[date][uid].status) || 'P';
    }

    function update3DColors(ts: ThreeState) {
        let p = 0, l = 0, a = 0;
        for (const id in ts.seatObjects) {
            const so = ts.seatObjects[id], st = getStatus3(ts, so.uid) as keyof typeof STATUS3;
            so.cushionMat.color.setHex(STATUS3[st].color); so.cushionMat.emissive.setHex(STATUS3[st].color); so.cushionMat.emissiveIntensity = 0.22;
            so.label.draw(STATUS3[st].hex);
            if (st === 'P') p++; else if (st === 'L') l++; else a++;
        }
        setStats({ p, l, a })
    }

    function rebuild3D(ts: ThreeState) {
        const { config, seatingLayout, students } = ts.propsRef
        
        // Clean old
        while (ts.worldGroup.children.length) {
            const o = ts.worldGroup.children.pop();
            if (!o) break;
            disposeObject3D(o);
            ts.worldGroup.remove(o);
        }
        ts.seatObjects = {}; ts.clickable = []; ts.deskGroups = [];

        // Build functions
        const buildDeskTop3 = (width: number) => {
            const g = new THREE.Group();
            const top = box3(width, TOP_T3, DESK_D3, MAT3(0xcb9a68, { roughness: 0.6 }));
            top.position.y = DESK_H3; g.add(top);
            const legMat = MAT3(0x9aa4b0, { metalness: 0.55, roughness: 0.45 });
            [-1, 1].forEach((s) => {
                const p = box3(0.05, DESK_H3, DESK_D3 * 0.8, legMat);
                p.position.set(s * (width / 2 - 0.12), DESK_H3 / 2, 0); g.add(p);
            });
            const bar = box3(width * 0.9, 0.16, 0.04, legMat);
            bar.position.set(0, DESK_H3 - 0.22, -DESK_D3 / 2 + 0.06); g.add(bar);
            return g;
        }
        const buildChair3 = (cushionMat: THREE.Material) => {
            const g = new THREE.Group();
            const seat = box3(CHAIR_S3, 0.06, CHAIR_S3, cushionMat); seat.position.y = SEAT_H3; g.add(seat);
            const back = box3(CHAIR_S3, 0.42, 0.06, cushionMat); back.position.set(0, SEAT_H3 + 0.24, CHAIR_S3 / 2 - 0.03); g.add(back);
            const legMat = MAT3(0x586b80, { metalness: 0.3, roughness: 0.5 });
            const l = CHAIR_S3 / 2 - 0.05;
            [[-l, -l], [l, -l], [-l, l], [l, l]].forEach((c) => { const leg = box3(0.045, SEAT_H3, 0.045, legMat); leg.position.set(c[0], SEAT_H3 / 2, c[1]); g.add(leg); });
            return g;
        }
        const buildGroupTable3 = (radius: number) => {
            const g = new THREE.Group();
            const top = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.07, 36), MAT3(0xcb9a68, { roughness: 0.6 }));
            top.position.y = DESK_H3; top.castShadow = true; top.receiveShadow = true; g.add(top);
            const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, DESK_H3, 16), MAT3(0x9aa4b0, { metalness: 0.5, roughness: 0.5 }));
            ped.position.y = DESK_H3 / 2; g.add(ped);
            return g;
        }
        const makeFloorTex3 = (w: number, d: number) => {
            const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d')!;
            x.fillStyle = '#eae3d6'; x.fillRect(0, 0, 512, 512);
            for (let i = 0; i < 2400; i++) { x.fillStyle = 'rgba(170,150,120,' + (Math.random() * 0.05) + ')'; x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2); }
            x.strokeStyle = 'rgba(120,110,95,.18)'; x.lineWidth = 2;
            for (let i = 0; i <= 8; i++) { const p = i * 64; x.beginPath(); x.moveTo(p, 0); x.lineTo(p, 512); x.stroke(); x.beginPath(); x.moveTo(0, p); x.lineTo(512, p); x.stroke(); }
            const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(Math.max(2, Math.round(w / 2.2)), Math.max(2, Math.round(d / 2.2))); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return t;
        }
        const makeLabel3 = (name: string, hex: string) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d')!;
            const fs = 44, padX = 24, dot = 24, gap = 11;
            ctx.font = '700 ' + fs + 'px sans-serif';
            const tw = ctx.measureText(name).width;
            const w = Math.ceil(tw + padX * 2 + dot + gap), h = Math.ceil(fs + 32);
            canvas.width = w; canvas.height = h;
            const tex = new THREE.CanvasTexture(canvas);
            tex.anisotropy = ts.renderer.capabilities.getMaxAnisotropy();
            tex.colorSpace = THREE.SRGBColorSpace;
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
            const sc = 0.0019; sprite.scale.set(w * sc, h * sc, 1);
            const draw = (color: string) => {
                ctx.clearRect(0, 0, w, h); const rr = h / 2;
                ctx.beginPath(); ctx.moveTo(rr, 0); ctx.arcTo(w, 0, w, h, rr); ctx.arcTo(w, h, 0, h, rr); ctx.arcTo(0, h, 0, 0, rr); ctx.arcTo(0, 0, w, 0, rr); ctx.closePath();
                ctx.fillStyle = 'rgba(255,255,255,.97)'; ctx.fill();
                ctx.lineWidth = 4.5; ctx.strokeStyle = color; ctx.stroke();
                ctx.beginPath(); ctx.arc(padX + dot / 2, h / 2, dot / 2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
                ctx.font = '700 ' + fs + 'px sans-serif'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#16263a';
                ctx.fillText(name, padX + dot + gap, h / 2 + 1); tex.needsUpdate = true;
            }
            draw(hex); return { sprite, draw };
        }
        const makePlant3 = (x: number, z: number) => {
            const g = new THREE.Group();
            const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.34, 18), MAT3(0xc66b3b, { roughness: 0.8 }));
            pot.position.y = 0.17; pot.castShadow = true; g.add(pot);
            const leaf = MAT3(0x4b9b5a, { roughness: 0.7 });
            for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.16 + Math.random() * 0.06, 10, 10), leaf); b.position.set((Math.random() - 0.5) * 0.25, 0.42 + Math.random() * 0.28, (Math.random() - 0.5) * 0.25); b.castShadow = true; g.add(b); }
            g.position.set(x, 0, z); return g;
        }

        const buildStudentCharacter3 = (gender: string) => {
            const g = new THREE.Group();
            
            // Load and clone the GLB model based on gender
            loadStudentModel(gender, (model) => {
                const clone = model.clone();
                
                // Scale for realistic student height
                clone.scale.set(1.55, 1.55, 1.55);
                
                // Automatically calculate bounding box to place feet on the floor
                const box = new THREE.Box3().setFromObject(clone);
                
                // Offset the Y position so the minimum Y (feet) is exactly at 0
                const yOffset = -box.min.y;
                
                // Position: perfectly on floor, z=-0.45 (middle of the newly widened gap)
                clone.position.set(0, yOffset, -0.45); 
                
                // Rotate 90 degrees to face the desk (fixes sideways facing)
                clone.rotation.y = Math.PI / 2;

                // Disable shadows for high-poly characters to significantly improve performance (fix lag)
                clone.traverse(child => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = false;
                        child.receiveShadow = false;
                    }
                });

                g.add(clone);
            });

            return { group: g };
        }

        const buildRoom3 = (roomW: number, roomD: number) => {
            const frontWallZ = -roomD / 2;
            const floor = new THREE.Mesh(new THREE.PlaneGeometry(roomW, roomD), MAT3(0xffffff, { map: makeFloorTex3(roomW, roomD), roughness: 0.92 }));
            floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; ts.worldGroup.add(floor);

            const wallMat = MAT3(0xeef2f6, { roughness: 1 }), lowMat = MAT3(0xe2e8ef, { roughness: 1 });
            const FRONT_H = 3.0, LOW_H = 0.55, WT = 0.12;
            const fw = box3(roomW, FRONT_H, WT, wallMat); fw.position.set(0, FRONT_H / 2, frontWallZ); ts.worldGroup.add(fw);
            const bw = box3(roomW, LOW_H, WT, lowMat); bw.position.set(0, LOW_H / 2, roomD / 2); ts.worldGroup.add(bw);
            const lw = box3(WT, LOW_H, roomD, lowMat); lw.position.set(-roomW / 2, LOW_H / 2, 0); ts.worldGroup.add(lw);
            const rw = box3(WT, LOW_H, roomD, lowMat); rw.position.set(roomW / 2, LOW_H / 2, 0); ts.worldGroup.add(rw);

            const board = box3(roomW * 0.46, 1.25, 0.06, MAT3(0x143b2a, { roughness: 0.55 })); board.position.set(0, 1.75, frontWallZ + 0.07); ts.worldGroup.add(board);
            const tray = box3(roomW * 0.47, 0.06, 0.12, MAT3(0x9c6b3f, { roughness: 0.6 })); tray.position.set(0, 1.1, frontWallZ + 0.12); ts.worldGroup.add(tray);
            const clk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 28), MAT3(0xffffff, { roughness: 0.4 })); clk.rotation.x = Math.PI / 2; clk.position.set(roomW * 0.32, 2.55, frontWallZ + 0.08); ts.worldGroup.add(clk);

            const td = new THREE.Group();
            const tdTop = box3(2.0, 0.08, 0.85, MAT3(0x9c6b3f, { roughness: 0.6 })); tdTop.position.y = 0.78; td.add(tdTop);
            [-1, 1].forEach((s) => { const p = box3(0.07, 0.78, 0.7, MAT3(0x586b80, { metalness: 0.3, roughness: 0.5 })); p.position.set(s * 0.9, 0.39, 0); td.add(p); });
            const tch = buildChair3(MAT3(0xb6c0cc, { roughness: 0.85 })); tch.position.set(0, 0, -0.7); tch.rotation.y = Math.PI; td.add(tch);
            td.position.set(-roomW / 2 + 2.0, 0, frontWallZ + 1.7); ts.worldGroup.add(td);
            const tl = makeLabel3('តុគ្រូបង្រៀន', '#1D3E73'); tl.sprite.position.set(-roomW / 2 + 2.0, 1.5, frontWallZ + 1.7); tl.sprite.userData.baseY = 1.5; ts.worldGroup.add(tl.sprite);

            const door = new THREE.Group();
            const frame = box3(1.1, 2.1, 0.16, MAT3(0x9c6b3f, { roughness: 0.6 })); frame.position.y = 1.05; door.add(frame);
            const pivot = new THREE.Group(); pivot.position.set(-0.46, 0, 0);
            const panel = box3(0.92, 1.92, 0.06, MAT3(0xb5793f, { roughness: 0.6 })); panel.position.set(0.46, 1.0, 0.1); pivot.add(panel);
            const handle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), MAT3(0x9aa4b0, { metalness: 0.55, roughness: 0.45 })); handle.position.set(0.8, 1.0, 0.16); pivot.add(handle);
            pivot.rotation.y = -0.5; door.add(pivot);
            door.position.set(roomW / 2 - 1.1, 0, roomD / 2 - 0.06); ts.worldGroup.add(door);

            const glass = MAT3(0xbfe3ff, { roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.4 });
            for (let i = 0; i < 2; i++) {
                const win = new THREE.Group();
                const g = box3(0.08, 1.0, 1.4, glass); win.add(g);
                const fr = box3(0.12, 1.1, 1.5, MAT3(0x586b80, { metalness: 0.3, roughness: 0.5 })); fr.position.x = -0.03; win.add(fr);
                win.position.set(-roomW / 2 + 0.06, 1.4, -roomD * 0.18 + i * roomD * 0.34); ts.worldGroup.add(win);
            }
            ts.worldGroup.add(makePlant3(-roomW / 2 + 0.7, roomD / 2 - 0.7));
            ts.worldGroup.add(makePlant3(roomW / 2 - 0.7, -roomD / 2 + 0.7));
        }

        const addSeat3 = (parent: THREE.Object3D, seatId: string, lx: number, lz: number, faceY?: number) => {
            const uid = seatingLayout[seatId];
            const cushionMat = uid ? MAT3(0xffffff, { roughness: 0.8 }) : MAT3(0xb6c0cc, { roughness: 0.85 });
            const chair = buildChair3(cushionMat);
            chair.position.set(lx, 0, lz);
            if (faceY !== undefined) chair.rotation.y = faceY;
            parent.add(chair);
            if (!uid) return;
            const student = students.find(s => (s.id || s.uid) === uid);
            const name = (student && (student.name_kh || student.full_name)) || '—';
            const gender = student ? student.gender : 'ប្រុស';
            const status = getStatus3(ts, uid) as keyof typeof STATUS3;
            
            const { group: studentGroup } = buildStudentCharacter3(gender);
            studentGroup.position.set(lx, 0, lz);
            if (faceY !== undefined) studentGroup.rotation.y = faceY;
            parent.add(studentGroup);

            cushionMat.color.setHex(STATUS3[status].color);
            cushionMat.emissive.setHex(STATUS3[status].color);
            cushionMat.emissiveIntensity = 0.22;
            const L = makeLabel3(name, STATUS3[status].hex);
            L.sprite.position.set(lx, 1.42, lz); L.sprite.userData.baseY = 1.42; L.sprite.visible = ts.labelsVisible;
            parent.add(L.sprite);
            const hit = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.0, 0.62), new THREE.MeshBasicMaterial({ visible: false }));
            hit.position.set(lx, SEAT_H3 + 0.3, lz); hit.userData.seatId = seatId; parent.add(hit); ts.clickable.push(hit);
            ts.seatObjects[seatId] = { uid, cushionMat, label: L, hitbox: hit };
        }

        const layoutGrid3 = () => {
            const cols = Math.max(1, config.gridCols);
            const rows = Math.max(1, Math.ceil(config.totalTables / cols));
            const seats = Math.max(1, config.seatsPerTable);
            const deskW = Math.max(1.0, seats * SEAT_SP3 + 0.2);
            const colPitch = deskW + 0.92, aisle = 1.3, rowPitch = DESK_D3 + 1.0 + 0.6;

            let xs = [];
            for (let c = 0; c < cols; c++) { xs.push(c * colPitch + (c >= cols / 2 ? aisle : 0)); }
            const xMid = (xs[0] + xs[cols - 1]) / 2; xs = xs.map(v => v - xMid);
            const gridW = (xs[cols - 1] - xs[0]) + deskW;

            const frontZone = 3.6, backMargin = 1.8, sideMargin = 2.2;
            const studentDepth = (rows - 1) * rowPitch + DESK_D3 / 2 + 0.65 + CHAIR_S3;
            ts.ROOM_W = gridW + sideMargin * 2;
            ts.ROOM_D = frontZone + studentDepth + backMargin;
            const frontWallZ = -ts.ROOM_D / 2;
            const zs = []; for (let r = 0; r < rows; r++) zs.push(frontWallZ + frontZone + r * rowPitch);

            buildRoom3(ts.ROOM_W, ts.ROOM_D);
            ts.camTarget.set(0, 0.7, (zs[0] + zs[rows - 1]) / 2);

            let idx = 0;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    idx++; if (idx > config.totalTables) break;
                    const table = idx, dx = xs[c], dz = zs[r];
                    const desk = new THREE.Group(); desk.position.set(dx, 0, dz);
                    desk.add(buildDeskTop3(deskW));
                    for (let s = 1; s <= seats; s++) {
                        const offX = (s - (seats + 1) / 2) * SEAT_SP3;
                        addSeat3(desk, 't' + table + '-s' + s, offX, DESK_D3 / 2 + 0.75, 0); // Moved chair back by 0.25 units
                    }
                    desk.userData.delay = (r * cols + c) * 0.04;
                    ts.deskGroups.push(desk); ts.worldGroup.add(desk);
                }
            }
        }

        const layoutGroup3 = () => {
            const cols = Math.max(1, config.gridCols);
            const rows = Math.max(1, Math.ceil(config.totalTables / cols));
            const N = Math.max(1, config.seatsPerTable);
            const tableR = 0.55 + N * 0.03;
            const seatR = tableR + 0.8; // Moved chair back by 0.2 units
            const cell = (seatR + CHAIR_S3 / 2) * 2 + 0.9;
            const ringR = seatR + CHAIR_S3 / 2;

            const frontZone = 3.4, backMargin = 1.8, sideMargin = 2.0;
            ts.ROOM_W = (cols - 1) * cell + ringR * 2 + sideMargin * 2;
            ts.ROOM_D = frontZone + (rows - 1) * cell + ringR * 2 + backMargin;
            const frontWallZ = -ts.ROOM_D / 2;

            let xs = []; for (let c = 0; c < cols; c++) xs.push(c * cell); const xMid = (xs[0] + xs[cols - 1]) / 2; xs = xs.map(v => v - xMid);
            const zs = []; for (let r = 0; r < rows; r++) zs.push(frontWallZ + frontZone + ringR + r * cell);

            buildRoom3(ts.ROOM_W, ts.ROOM_D);
            ts.camTarget.set(0, 0.7, (zs[0] + zs[rows - 1]) / 2);

            let idx = 0;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    idx++; if (idx > config.totalTables) break;
                    const table = idx;
                    const grp = new THREE.Group(); grp.position.set(xs[c], 0, zs[r]);
                    grp.add(buildGroupTable3(tableR));
                    for (let s = 1; s <= N; s++) {
                        const ang = (2 * Math.PI / N) * (s - 1) - Math.PI / 2;
                        addSeat3(grp, 't' + table + '-s' + s, seatR * Math.cos(ang), seatR * Math.sin(ang), Math.PI / 2 - ang);
                    }
                    grp.userData.delay = (r * cols + c) * 0.05;
                    ts.deskGroups.push(grp); ts.worldGroup.add(grp);
                }
            }
        }

        if (config.layout && config.layout.startsWith('group-')) layoutGroup3();
        else layoutGrid3();

        ts.R0 = Math.hypot(ts.ROOM_W, ts.ROOM_D) * 0.78;
        if (ts.firstBuild) { ts.revealStart = ts.clock.getElapsedTime(); ts.deskGroups.forEach(g => { g.scale.setScalar(0.001); }); }
        else { ts.deskGroups.forEach(g => { g.scale.setScalar(1); }); }
        update3DColors(ts);
    }

    return (
        <div className="fixed inset-0 z-[100] bg-brand-950 flex flex-col">
            <div className="absolute top-4 left-4 z-50">
                <Button variant="secondary" printHidden={false} onClick={onClose} title="Back to 2D" data-close-3d>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </Button>
            </div>
            
            <canvas ref={canvasRef} className="w-full h-full block touch-none cursor-grab" style={{ touchAction: 'none' }}></canvas>
            
            {loading && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-brand-950 gap-4">
                    <div className="w-11 h-11 border-4 border-white/20 border-t-brand-400 rounded-full animate-spin"></div>
                    <p className="text-brand-300 text-sm">កំពុងបង្កើតថ្នាក់រៀន ៣វិមាត្រ…</p>
                </div>
            )}

            {/* HUD Overlay */}
            <div className="absolute left-1/2 bottom-5 -translate-x-1/2 flex items-center justify-center gap-2 p-2 max-w-[94vw] flex-wrap bg-bg-surface/80 backdrop-blur-md rounded-xl border border-white/50 shadow-lg z-30">
                <div className="flex gap-2">
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-bg-surface/60">
                        <span className="w-2.5 h-2.5 rounded bg-success"></span>
                        <div className="flex flex-col leading-none">
                            <span className="font-bold text-text-heading">{toKhmerNumber(stats.p)}</span>
                            <span className="text-[9px] text-text-muted mt-0.5">មក</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-bg-surface/60">
                        <span className="w-2.5 h-2.5 rounded bg-warning"></span>
                        <div className="flex flex-col leading-none">
                            <span className="font-bold text-text-heading">{toKhmerNumber(stats.l)}</span>
                            <span className="text-[9px] text-text-muted mt-0.5">ច្បាប់</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-bg-surface/60">
                        <span className="w-2.5 h-2.5 rounded bg-danger"></span>
                        <div className="flex flex-col leading-none">
                            <span className="font-bold text-text-heading">{toKhmerNumber(stats.a)}</span>
                            <span className="text-[9px] text-text-muted mt-0.5">អវត្ត</span>
                        </div>
                    </div>
                </div>
                
                <div className="w-px h-6 bg-brand-950/10 mx-1"></div>
                
                <div className="flex gap-1 bg-brand-950/5 p-1 rounded-xl">
                    <button onClick={() => setCurrent3DView('top')} className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition whitespace-nowrap ${current3DView === 'top' ? 'bg-brand text-white shadow-md' : 'text-text-muted hover:bg-bg-surface/70 hover:text-text-heading'}`}>ពីលើ</button>
                    <button onClick={() => setCurrent3DView('teacher')} className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition whitespace-nowrap ${current3DView === 'teacher' ? 'bg-brand text-white shadow-md' : 'text-text-muted hover:bg-bg-surface/70 hover:text-text-heading'}`}>ទិដ្ឋភាពគ្រូ</button>
                    <button onClick={() => setCurrent3DView('student')} className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition whitespace-nowrap ${current3DView === 'student' ? 'bg-brand text-white shadow-md' : 'text-text-muted hover:bg-bg-surface/70 hover:text-text-heading'}`}>ទិដ្ឋភាពសិស្ស</button>
                </div>

                <div className="w-px h-6 bg-brand-950/10 mx-1"></div>

                <button onClick={() => setLabelsVisible(!labelsVisible)} className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition whitespace-nowrap ${labelsVisible ? 'bg-success/15 text-success' : 'bg-brand-950/5 text-text-muted'}`}>ឈ្មោះ</button>
                <button onClick={() => setAutoSpin(!autoSpin)} className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition whitespace-nowrap ${autoSpin ? 'bg-success/15 text-success' : 'bg-brand-950/5 text-text-muted'}`}>បង្វិល</button>
            </div>

            <div className="absolute left-4 bottom-5 hidden md:flex flex-col gap-1.5 p-3 text-[11px] text-text-muted bg-bg-surface/80 backdrop-blur-md border border-white/50 rounded-xl z-30 shadow-lg">
                {(['P', 'L', 'A'] as const).map((code) => (
                    <Badge key={code} variant={ATTENDANCE_BADGE[code].variant} size="sm">
                        {ATTENDANCE_BADGE[code].label}
                    </Badge>
                ))}
            </div>

            <div className="absolute right-4 bottom-5 hidden md:block p-3 text-[11px] text-text-muted max-w-[220px] leading-relaxed bg-bg-surface/80 backdrop-blur-md border border-white/50 rounded-xl z-30 shadow-lg">
                <b className="text-brand">អូស</b> បង្វិល · <b className="text-brand">scroll/pinch</b> ពង្រីក · <b className="text-brand">ចុចតុ</b> ប្តូរវត្តមាន
            </div>
        </div>
    )
}
