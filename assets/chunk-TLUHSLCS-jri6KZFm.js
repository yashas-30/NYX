const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/dagre-GXQ25YYZ-D-MittMk.js","assets/chunk-PWAF6VOD-C73b6_zb.js","assets/chunk-X3CZISLH-BnlqbmGY.js","assets/rolldown-runtime-CMxvf4Kt.js","assets/chunk-Y2CYZVJY-DsF7k-Jl.js","assets/chunk-DU6HZSFF-B4qOUoA6.js","assets/index-DGNEn3r-.js","assets/vendor-base-ui-BAM_6MVb.js","assets/vendor-animation-BN46AcYK.js","assets/vendor-virtual-BLQLR0WZ.js","assets/vendor-markdown-DKNd1xPy.js","assets/vendor-katex-1qM3YPdw.js","assets/vendor-katex-CI_pfXFy.css","assets/vendor-icons-D0ulNE5P.js","assets/index-B-2UGzk4.css","assets/vendor-charts-D0otp-a5.js","assets/chunk-75Z2AOVW-ghaplF1E.js","assets/dist-Cna34lZe.js","assets/chunk-GMAD6QVW-D8wHPqIB.js","assets/chunk-2E4U76K2-B2c2njxf.js","assets/chunk-4HAMMTFA-B2dHtiw6.js","assets/chunk-P2QGCYS3-DV2LW8Hh.js","assets/rough.esm-CSKSodPl.js","assets/chunk-GVQU2GXP-D3M6OVNd.js","assets/chunk-L3NEJ4N5-dmIeXR1H.js","assets/chunk-OSK3NFVY-BzRAFl3q.js","assets/swimlanes-42K2YHIH-C8YPu4T1.js","assets/cose-bilkent-JH36ORCC-DTcqfYq0.js","assets/cytoscape.esm-h6BdjjI9.js"])))=>i.map(i=>d[i]);
import { d as e, u as t, __tla as __tla_0 } from "./index-DGNEn3r-.js";
import { n } from "./chunk-Y2CYZVJY-DsF7k-Jl.js";
import { t as r } from "./chunk-X3CZISLH-BnlqbmGY.js";
import { b as i, s as a, __tla as __tla_1 } from "./chunk-DU6HZSFF-B4qOUoA6.js";
import { d as o } from "./chunk-75Z2AOVW-ghaplF1E.js";
import { a as s } from "./chunk-4HAMMTFA-B2dHtiw6.js";
import { r as c } from "./chunk-GVQU2GXP-D3M6OVNd.js";
import { a as l, c as u, i as d, s as f } from "./chunk-OSK3NFVY-BzRAFl3q.js";
import { n as p } from "./chunk-L3NEJ4N5-dmIeXR1H.js";
let g, _, v;
let __tla = Promise.all([
    (()=>{
        try {
            return __tla_0;
        } catch  {}
    })(),
    (()=>{
        try {
            return __tla_1;
        } catch  {}
    })()
]).then(async ()=>{
    e();
    let m, h;
    m = {
        common: a,
        getConfig: i,
        insertCluster: p,
        insertEdge: d,
        insertEdgeLabel: l,
        insertMarkers: f,
        insertNode: c,
        interpolateToCurve: o,
        labelHelper: s,
        log: r,
        positionEdgeLabel: u
    };
    h = {};
    g = n((e)=>{
        for (let t of e)h[t.name] = t;
    }, `registerLayoutLoaders`);
    n(()=>{
        g([
            {
                name: `dagre`,
                loader: n(async ()=>await t(()=>import(`./dagre-GXQ25YYZ-D-MittMk.js`).then(async (m)=>{
                            await m.__tla;
                            return m;
                        }), __vite__mapDeps([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25])), `loader`)
            },
            {
                name: `swimlane`,
                loader: n(async ()=>await t(()=>import(`./swimlanes-42K2YHIH-C8YPu4T1.js`).then(async (m)=>{
                            await m.__tla;
                            return m;
                        }), __vite__mapDeps([26,1,2,3,4,5,6,7,8,9,10,11,12,13,14,16,17,15,18,19,20,21,22,23,24,25])), `loader`)
            },
            {
                name: `cose-bilkent`,
                loader: n(async ()=>await t(()=>import(`./cose-bilkent-JH36ORCC-DTcqfYq0.js`).then(async (m)=>{
                            await m.__tla;
                            return m;
                        }), __vite__mapDeps([27,3,28,15,2,4])), `loader`)
            }
        ]);
    }, `registerDefaultLayoutLoaders`)();
    _ = n(async (e, t)=>{
        if (!(e.layoutAlgorithm in h)) throw Error(`Unknown layout algorithm: ${e.layoutAlgorithm}`);
        if (e.diagramId) for (let t of e.nodes){
            let n = t.domId || t.id;
            t.domId = `${e.diagramId}-${n}`;
        }
        let n = h[e.layoutAlgorithm], r = await n.loader(), { theme: i, themeVariables: a } = e.config, { useGradient: o, gradientStart: s, gradientStop: c } = a, l = t.attr(`id`);
        if (t.append(`defs`).append(`filter`).attr(`id`, `${l}-drop-shadow`).attr(`height`, `130%`).attr(`width`, `130%`).append(`feDropShadow`).attr(`dx`, `4`).attr(`dy`, `4`).attr(`stdDeviation`, 0).attr(`flood-opacity`, `0.06`).attr(`flood-color`, `${i?.includes(`dark`) ? `#FFFFFF` : `#000000`}`), t.append(`defs`).append(`filter`).attr(`id`, `${l}-drop-shadow-small`).attr(`height`, `150%`).attr(`width`, `150%`).append(`feDropShadow`).attr(`dx`, `2`).attr(`dy`, `2`).attr(`stdDeviation`, 0).attr(`flood-opacity`, `0.06`).attr(`flood-color`, `${i?.includes(`dark`) ? `#FFFFFF` : `#000000`}`), o) {
            let e = t.append(`linearGradient`).attr(`id`, t.attr(`id`) + `-gradient`).attr(`gradientUnits`, `objectBoundingBox`).attr(`x1`, `0%`).attr(`y1`, `0%`).attr(`x2`, `100%`).attr(`y2`, `0%`);
            e.append(`svg:stop`).attr(`offset`, `0%`).attr(`stop-color`, s).attr(`stop-opacity`, 1), e.append(`svg:stop`).attr(`offset`, `100%`).attr(`stop-color`, c).attr(`stop-opacity`, 1);
        }
        return r.render(e, t, m, {
            algorithm: n.algorithm
        });
    }, `render`);
    v = n((e = ``, { fallback: t = `dagre` } = {})=>{
        if (e in h) return e;
        if (t in h) return r.warn(`Layout algorithm ${e} is not registered. Using ${t} as fallback.`), t;
        throw Error(`Both layout algorithms ${e} and ${t} are not registered.`);
    }, `getRegisteredLayoutAlgorithm`);
});
export { g as n, _ as r, v as t, __tla };
