import { ease, loft, union } from './sculpt.js';

// Raised muscle bellies and the narrow depressions between them change the
// transverse contour of each section. Dimensions are in metres.
function mound(x, y, cx, cy, alongX, alongY, length, breadth) {
  const dx = x - cx, dy = y - cy;
  const a = (dx * alongX + dy * alongY) / length;
  const b = (dy * alongX - dx * alongY) / breadth;
  const r = a * a + b * b;
  return r > 6 ? 0 : Math.exp(-r);
}

const barrel = loft([0,0], [1,0], [0,1], [
  [-.878,1.206,1.218,.013], [-.862,1.118,1.309,.100],
  [-.814,1.033,1.400,.174], [-.744,.957,1.491,.225],
  [-.625,.900,1.600,.253], [-.482,.878,1.663,.260],
  [-.354,.878,1.625,.274], [-.172,.889,1.572,.293],
  [ .022,.910,1.548,.300], [ .205,.940,1.550,.281],
  [ .373,.986,1.572,.249], [ .501,1.012,1.594,.253],
  [ .623,1.012,1.602,.280], [ .732,1.005,1.583,.284],
  [ .830,1.032,1.539,.244], [ .903,1.102,1.456,.172],
  [ .941,1.174,1.381,.106], [ .955,1.257,1.283,.016]
], (x, y, yn) => {
  let change = -.028 * ease(.4, .94, yn);
  if (x < -.17) {
    change += .043 * mound(x,y,-.57,1.326,.40,.916,.253,.073);
    change += .039 * mound(x,y,-.492,1.113,.57,.822,.145,.091);
    change -= .019 * mound(x,y,-.373,1.235,.39,.922,.225,.049);
    change -= .015 * mound(x,y,-.654,1.199,.60,-.80,.103,.025);
    change += .022 * mound(x,y,-.575,1.071,.59,-.807,.138,.060);
  }
  if(x > -.36 && x < .49) {
    change += .019 * mound(x,y,.058,1.076,.955,.295,.346,.059);
    change -= .012 * mound(x,y,.114,1.122,.96,.28,.291,.034);
    const ribs = mound(x,y,.025,1.270,1,0,.30,.17);
    change += .0038 * ribs * Math.cos((x + .34*(y-1.27) + .91*(y-1.27)**2)*55);
  }
  if (x > .03) {
    change -= .025 * mound(x,y,.287,1.317,.90,.435,.141,.077);
    change += .035 * mound(x,y,.576,1.373,.63,.776,.204,.133);
    change += .027 * mound(x,y,.746,1.250,.35,.937,.218,.075);
    change -= .025 * mound(x,y,.660,1.213,.42,.908,.167,.041);
    change += .018 * mound(x,y,.487,1.127,.52,.854,.151,.062);
  }
  return change;
});

const neckAxis = [-.82, Math.sqrt(1 - .82 * .82)];
const neckUp = [neckAxis[1], -neckAxis[0]];
const neck = loft([-.60,1.39], neckAxis, neckUp, [
  [-.355,-.020,.040,.025], [-.260,-.140,.114,.136],
  [-.132,-.253,.215,.199], [.052,-.322,.289,.208],
  [.235,-.233,.294,.177], [.440,-.152,.283,.150],
  [.645,-.076,.243,.125], [.770,-.051,.182,.101],
  [.839,-.041,.127,.082], [.889,-.022,.076,.055], [.927,.003,.024,.013]
], (u, v, yn) => {
  const groove = (v - (.106 * u - .093)) / .034;
  const ridge = (v - (.268 * u - .094)) / .080;
  const span = ease(-.03,.19,u) * (1 - ease(.62,.88,u));
  return span * (.026 * Math.exp(-ridge * ridge) - .016 * Math.exp(-groove * groove)) - .016 * ease(.45,.98,yn);
});

export const headOrigin = [-1.208, 1.914];
export const faceAxis = [-.61, -Math.sqrt(1 - .61 * .61)];
export const faceUp = [faceAxis[1], -faceAxis[0]];
export function nostrilUV(r, angle) {
  const a=r*Math.cos(angle), b=r*Math.sin(angle);
  return [.514 + .044*a, .033 - .010*a + .006*a*a + .022*b*(1+.31*a)];
}
export const face = loft(headOrigin, faceAxis, faceUp, [
  [-.116,-.015,.024,.020], [-.086,-.075,.056,.070],
  [-.042,-.126,.076,.102], [.018,-.169,.094,.123],
  [.080,-.205,.109,.139], [.137,-.222,.109,.142],
  [.164,-.226,.105,.136], [.196,-.204,.099,.124], [.232,-.149,.091,.101],
  [.275,-.105,.082,.087], [.350,-.082,.080,.071], [.422,-.075,.080,.073],
  [.475,-.079,.081,.090], [.516,-.082,.082,.097],
  [.555,-.083,.074,.099], [.587,-.073,.059,.093],
  [.609,-.049,.042,.077], [.619,-.035,.024,.055], [.626,-.013,.008,.026], [.628,-.004,.002,.009]
], (u,v) => {
  let d = .039 * mound(u,v,.134,-.113,.92,.392,.095,.068);
  d -= .022 * mound(u,v,.038,-.096,.16,.987,.095,.031);
  d += .020 * mound(u,v,.091,.037,1,0,.050,.034);
  d -= .018 * mound(u,v,.150,.042,.99,-.14,.065,.024);
  d += .016 * mound(u,v,.235,-.007,.98,-.199,.099,.021);
  d -= .008 * mound(u,v,.381,-.024,1,0,.098,.029);
  if(u>.445 && u<.582 && v>-.012 && v<.081) {
    const a=(u-.514)/.044, b=(v-.033+.010*a-.006*a*a)/(.022*(1+.31*a));
    const radius=Math.hypot(a,b);
    d -= .032 * (1-ease(.36,1.05,radius));
    d += .005 * Math.exp(-((radius-1.04)**2)/.055) * (.72+.20*Math.max(0,b));
  }
  if(u>.394 && v<0) {
    const lip=(v - (-.040+.026*ease(.42,.62,u)))/.006;
    d-=.007*Math.exp(-lip*lip)*ease(.394,.466,u);
  }
  return d;
});

export function anatomy(limbs) {
  function distance(x, y, z) {
    const az = Math.abs(z);
    if (az > .37) return az - .34;
    let d = 1;
    if (x > -.99 && y > .70 && y < 1.80) d = barrel.field(x,y,z);
    if (x < -.25 && x > -1.41 && y > .92 && y < 2.08)
      d = union(d, neck.field(x,y,z), .103);
    if (x<-.52 && x>-.99 && y>.94 && y<1.52) {
      const dy=(y-1.232)/.223, dx=(x+.761+.17*(y-1.232))/.157;
      const breast=(Math.sqrt(dx*dx+dy*dy+(z/.192)**2)-1)*.157;
      d=union(d,breast,.044);
    }
    if (x < -.985 && y > 1.31 && y < 2.08)
      d = union(d, face.field(x,y,z), .048);
    if (y < 1.61 && x > -1.02) d = union(d, limbs.distance(x,y,z), .075);
    return Math.min(.35, d);
  }
  function skin(x, y, z) {
    const leg=limbs.skin(x,y,z) ?? [[0,1]];
    if (x < -.34 && y > 1.04) {
      const u = (x + .60) * neckAxis[0] + (y - 1.39) * neckAxis[1];
      // A sloped throatlatch lets the jaw follow the skull while keeping the
      // back of the neck supple when the horse nods.
      const skull = ease(1.067,1.210,-x + .10 * (1.85 - y));
      if (skull > .999) return [[2, 1]];
      const neckAmount = ease(-.08,.39,u) * ease(1.04,1.36,y) * ease(.34,.60,-x);
      if (neckAmount > 0 || skull > 0) {
        const rest=(1-neckAmount)*(1-skull);
        const result=leg.map(([index,w])=>[index,w*rest]);
        if (neckAmount) result.push([1,neckAmount*(1-skull)]);
        if (skull) result.push([2,skull]);
        return result;
      }
    }
    return leg;
  }
  return {distance, skin};
}
