import * as THREE from 'three';
import { face, faceAxis, faceUp, nostrilUV } from './anatomy.js';
import { clamp, ease } from './sculpt.js';

const TAU = 2 * Math.PI;
const colour = (hex) => new THREE.Color(hex);
const mat = (color, roughness = .62) => new THREE.MeshStandardMaterial({ color, roughness, side: THREE.DoubleSide });
const vertexMat = (roughness) => new THREE.MeshPhysicalMaterial({
  vertexColors: true, roughness, side: THREE.DoubleSide,
});

function surface(rows, around, point, material, close = true) {
  const positions = [], colors = [], triangles = [];
  const cols = close ? around : around + 1;
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j < cols; j++) {
      const [p, c] = point(i / rows, j / around);
      positions.push(p.x, p.y, p.z);
      if (c) colors.push(c.r,c.g,c.b);
      if (i === rows || (!close && j === around)) continue;
      const a = i * cols + j, b = i * cols + (j + 1) % cols;
      triangles.push(a, a + cols, b, b, a + cols, b + cols);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
  if (colors.length) g.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  g.setIndex(triangles);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function cord(points, thickness, material, sides = 8) {
  const curve = new THREE.CatmullRomCurve3(points);
  const ref = new THREE.Vector3(0,0,1);
  return surface(24, sides, (u,a) => {
    const p = curve.getPoint(u), dir = curve.getTangent(u);
    const n = new THREE.Vector3().crossVectors(dir,ref).normalize();
    const b = new THREE.Vector3().crossVectors(n,dir).normalize();
    const angle = a * TAU, r = thickness(u);
    return [p.addScaledVector(n, r * Math.cos(angle)).addScaledVector(b, r * Math.sin(angle))];
  }, material);
}

function eye(side, lid, lining, glass) {
  const group = new THREE.Group(), u0 = .105, v0 = .025;
  group.name = 'Eye and lids';
  const center = face.sidePoint(u0,v0,side);
  group.position.copy(center);
  const at = (dx,dy,lift) => face.sidePoint(
    u0 + dx * faceAxis[0] + dy * faceAxis[1],
    v0 + dx * faceUp[0] + dy * faceUp[1], side, lift
  ).sub(center);
  const iris = colour('#644324'), irisEdge = colour('#32251b'), pupil = colour('#110f0e');
  const eyeWhite = colour('#514337');
  function shape(r, f) {
    const a = f * TAU, c = Math.cos(a), s = Math.sin(a);
    const x = r * .030 * c;
    const y = r * (s>0?.0148:.0129) * s * (1 - .29 * Math.abs(c)) + x * .12;
    return [x,y];
  }
  const lens = surface(12, 64, (r,f) => {
    const [x,y] = shape(r,f);
    const radius = Math.hypot((x + .002) / .019, y / .019);
    const pupilD = Math.hypot((x + .0025) / .0136, y / .0048);
    const striae = .16 * Math.sin(44 * Math.atan2(y,x + .002));
    const c = iris.clone().lerp(irisEdge,clamp(.18 + .56 * radius + striae))
      .lerp(eyeWhite, ease(.89,1.35,radius) * .70)
      .lerp(pupil, 1 - ease(.78,1.16,pupilD));
    return [at(x,y,.0020 + .0065 * (1 - r*r)),c];
  }, glass);
  group.add(lens);
  for (const top of [-1,1]) {
    const path = [];
    for (let i = 0; i <= 14; i++) {
      const a = top * i * Math.PI / 14;
      const [x,y] = shape(1,a / TAU);
      path.push(at(x, y + top * .0006, .0025));
    }
    group.add(cord(path, t => .0003 + .0008 * Math.sin(Math.PI*t), lining));
    // A lid thickens at its free edge and disappears under the surrounding
    // skin. The upper lid shades the cornea like a small hood.
    const hood=surface(9,26,(r,f)=>{
      const [x,y]=shape(1,top*f*.5), span=Math.sin(Math.PI*f);
      const rise=(top>0?.012:.008)*span;
      const lift=.0030*(1-r) + (top>0?.0046:.0023)*Math.sin(Math.PI*r)*span - .0024*r*r;
      return [at(x*(1+.17*r),y+top*rise*r,lift)];
    },lid,false);
    group.add(hood);
  }
  const lashes=[];
  for(let i=0;i<12;i++) {
    const f=(i+1)/15, [x,y]=shape(1,f*.5), vary=Math.sin(i*30.3);
    const p=at(x,y+.0019,.0032);
    const q=p.clone().add(new THREE.Vector3(.0022+vary*.001,.0037+vary*.0018,side*(.0045+.002*Math.sin(i*1.9))));
    lashes.push(...p.toArray(),...q.toArray());
  }
  const lashG=new THREE.BufferGeometry();
  lashG.setAttribute('position',new THREE.Float32BufferAttribute(lashes,3));
  group.add(new THREE.LineSegments(lashG,new THREE.LineBasicMaterial({color:'#27201c',transparent:true,opacity:.69})));
  const glint = new THREE.Mesh(new THREE.SphereGeometry(1,12,8), new THREE.MeshBasicMaterial({color:'#e2ded2'}));
  glint.scale.set(.0033,.0013,.0008);
  glint.rotation.z = -.36;
  glint.position.copy(at(-.007,.0057,.0086));
  group.add(glint);
  return group;
}

function nostril(side, interior) {
  const group = new THREE.Group();
  function position(r, f, lift) {
    const [u,v]=nostrilUV(r,f*TAU);
    return face.sidePoint(u,v,side,lift);
  }
  const abyss = colour('#100d0e'), inner = colour('#362b29');
  group.add(surface(15,56,(r,f) => {
    const c = abyss.clone().lerp(inner, .06 + .80*r**2*(.56+.44*Math.sin(TAU*f)));
    return [position(r*.91,f,.0026 + .0009*(1-r)),c];
  },interior));
  return group;
}

function ear(side, palette) {
  const pivot = new THREE.Group();
  pivot.position.set(side === 1 ? -1.172 : -1.166,1.952,side*.069);
  const front = new THREE.Vector3(-.752, 0, side*.659);
  const across = new THREE.Vector3(.659, 0, side*.752);
  const material = vertexMat(.70);
  const tones = [];
  function earPoint(t,f) {
    const a = f * TAU, s = Math.sin(a), c = Math.cos(a);
    const envelope = Math.pow(Math.max(.001,Math.sin(Math.PI*(.17+.83*t))),.72);
    const width = (.048 + .008 * Math.sin(Math.PI*t)) * envelope;
    const depth = (.025 + .008*(1-t)) * envelope;
    const hollow = Math.max(0,c) ** 2.8 * ease(.06,.28,t) * (1 - ease(.80,.99,t));
    const p = new THREE.Vector3(
      side < 0 ? -.035*t - .043*t*t : .007*t - .021*t*t, .218*t, side*(.031*t + .011*Math.sin(Math.PI*t))
    ).addScaledVector(across, s*width).addScaledVector(front, c*depth - hollow*.036);
    const inside = ease(.24,.74,c) * ease(.12,.31,t) * (1 - ease(.78,.97,t));
    const edge = ease(.70,.99,Math.abs(s)) * .48;
    const tip = ease(.64,.97,t);
    return {p,inside,edge,tip};
  }
  const mesh = surface(33,48,(t,f)=>{
    const {p,inside,edge,tip}=earPoint(t,f);
    tones.push([inside,edge,tip]);
    return [p,colour('#785035')];
  },material);
  const hairs=[], hairTones=[];
  const rand=i=>((Math.sin(i*49.781+side*2.19)*11917.611)%1+1)%1;
  for(let i=0;i<124;i++) {
    const t=.10+.67*rand(i*3), f=(i%2?1:-1)*(.115+.10*rand(i*3+1));
    const p=earPoint(t,f).p.addScaledVector(front,.0014);
    const q=earPoint(t+.023+.039*rand(i*3+2),f*.79).p.addScaledVector(front,.0021);
    hairs.push(...p.toArray(),...q.toArray());
    const gray=.43+.50*rand(i+381);
    hairTones.push(gray,gray,gray,gray*.74,gray*.74,gray*.74);
  }
  const hairG=new THREE.BufferGeometry();
  hairG.setAttribute('position',new THREE.Float32BufferAttribute(hairs,3));
  hairG.setAttribute('color',new THREE.Float32BufferAttribute(hairTones,3));
  const earHair=new THREE.LineSegments(hairG,new THREE.LineBasicMaterial({
    color:0x9e7e65,vertexColors:true,transparent:true,opacity:.53,
  }));
  pivot.add(earHair);
  function recolor(id) {
    const p = palette[id];
    const base = colour(p[0]), point = colour(p[1]), inner = colour(p[2]), hair = colour(p[3]);
    const colors = mesh.geometry.getAttribute('color');
    const c = new THREE.Color();
    tones.forEach(([inside,edge,tip],i) => {
      c.copy(base).lerp(inner,.83*inside).lerp(hair,edge).lerp(point,.88*tip);
      colors.setXYZ(i,c.r,c.g,c.b);
    });
    colors.needsUpdate = true;
    earHair.material.color.set(p[3]);
  }
  pivot.add(mesh);
  return { pivot, recolor };
}

export function createFace(head) {
  const detail = new THREE.Group();
  // The detail is authored in the same bind pose as the continuous skin.
  detail.position.copy(head.getWorldPosition(new THREE.Vector3())).negate();
  head.add(detail);
  const palette = {
    bay:['#693b28','#271f1d','#49352c','#a18265'],
    chestnut:['#aa663f','#6c4334','#72534b','#be9775'],
    grey:['#a3a19a','#514d4a','#736765','#c4beb3']
  };
  const lid = mat('#503529',.75), lining = mat('#2d211d',.64);
  const glass = vertexMat(.19);
  glass.clearcoat = .42; glass.clearcoatRoughness = .14; glass.specularIntensity=.60;
  const inner = vertexMat(.92), mouth = mat('#201a19',.87);
  const ears = [], eyes = [], whiskers = [];
  for (const s of [1,-1]) {
    const earPart = ear(s, palette);
    ears.push(earPart); detail.add(earPart.pivot);
    const ocular = eye(s,lid,lining,glass);
    eyes.push(ocular); detail.add(ocular,nostril(s,inner));
    const seam = [[.404,-.040],[.437,-.040],[.478,-.035],[.524,-.028],[.557,-.023],[.585,-.017],[.611,-.014],[.623,-.010]];
    detail.add(cord(seam.map(([u,v]) => face.sidePoint(u,v,s,.0009)),
      t => .00025 + .0013 * Math.sin(Math.PI*t) ** .55, mouth));
    for (let i=0; i<13; i++) {
      const v = -.034 + .013 * Math.sin(i*3.17), u = .478 + .119 * (i/13);
      const p = face.sidePoint(u,v,s,.001);
      const q = p.clone().add(new THREE.Vector3(-.010-.009*Math.cos(i*5.13),-.013-.009*Math.sin(i*2.9),s*(.013+.011*Math.sin(i*9.4))));
      whiskers.push(...p.toArray(),...q.toArray());
    }
  }
  const hairs = new THREE.BufferGeometry();
  hairs.setAttribute('position',new THREE.Float32BufferAttribute(whiskers,3));
  detail.add(new THREE.LineSegments(hairs,new THREE.LineBasicMaterial({color:'#61564e',transparent:true,opacity:.32})));
  function setCoat(id) {
    ears.forEach(e => e.recolor(id));
    lid.color.set(palette[id][0]).lerp(colour('#312825'),.55);
    mouth.color.set(id==='grey' ? '#393535' : id==='chestnut' ? '#382b26' : '#211b1a');
  }
  function update(t) {
    const cycle = ((t+2.1) % 5.73) - 5.51;
    const blink = Math.abs(cycle) < .105 ? (1 - Math.abs(cycle)/.105) : 0;
    eyes.forEach(e => e.scale.y = 1 - .94*blink);
    ears[0].pivot.rotation.y = -.10 + .10*Math.sin(t*.73) + .17*Math.pow(Math.max(0,Math.sin(t*.87-.66)),12);
    ears[1].pivot.rotation.y = .15 + .19*Math.sin(t*.83+1.7);
    ears[0].pivot.rotation.z = .028*Math.sin(t*.61);
    ears[1].pivot.rotation.x = -.035 - .045*Math.sin(t*.51+.5);
  }
  setCoat('bay');
  return {setCoat, update};
}
