const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/sizeCapture-INFHLROL-B0uUizjq.js","assets/chunk-Y2CYZVJY-DsF7k-Jl.js"])))=>i.map(i=>d[i]);
import { d as e, u as t, __tla as __tla_0 } from "./index-DGNEn3r-.js";
import { n } from "./chunk-Y2CYZVJY-DsF7k-Jl.js";
import { t as r } from "./chunk-X3CZISLH-BnlqbmGY.js";
import { b as i, x as a, __tla as __tla_1 } from "./chunk-DU6HZSFF-B4qOUoA6.js";
import { c as o } from "./vendor-charts-D0otp-a5.js";
import { g as s } from "./chunk-75Z2AOVW-ghaplF1E.js";
import { a as c } from "./chunk-4HAMMTFA-B2dHtiw6.js";
import { i as l, n as u, r as d, t as f } from "./chunk-GVQU2GXP-D3M6OVNd.js";
import { a as p, i as m, l as h, n as g, r as _, s as v, t as ee } from "./chunk-OSK3NFVY-BzRAFl3q.js";
import { n as y, t as b } from "./chunk-L3NEJ4N5-dmIeXR1H.js";
let x, C, H, G, U, W, T, P, I, z;
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
    x = function(e, { edgePathsClass: t = `edges edgePaths` } = {}) {
        let n = e.insert(`g`).attr(`class`, `root`);
        return {
            clusters: n.insert(`g`).attr(`class`, `clusters`),
            edgePaths: n.insert(`g`).attr(`class`, t),
            edgeLabels: n.insert(`g`).attr(`class`, `edgeLabels`),
            nodes: n.insert(`g`).attr(`class`, `nodes`),
            rootGroups: n
        };
    };
    n(x, `createLayoutElementGroups`);
    async function S(e, t) {
        if (t.label) {
            let { shapeSvg: n, bbox: r } = await c(e, t);
            t.labelBBox = {
                width: r.width,
                height: r.height
            }, n.remove();
        } else t.labelBBox = {
            width: 0,
            height: 0
        };
    }
    n(S, `measureGroupLabel`);
    C = async function(e, t, n) {
        let r = await d(e, t, n), i = r.node()?.getBBox() ?? {
            width: 0,
            height: 0
        };
        return t.width = i.width, t.height = i.height, r;
    };
    n(C, `insertMeasuredNode`);
    async function w(e, n) {
        let r = new o({
            multigraph: !0,
            compound: !0
        }), i = [
            ...n.edges
        ], s = a(), c = x(e), { edgeLabels: l, nodes: u } = c, d = new Map, f = e.node() != null;
        await Promise.all(n.nodes.map(async (e)=>{
            if (e.isGroup) f && await S(u, e), r.setNode(e.id, {
                ...e
            });
            else {
                if (f) {
                    let t = await C(u, e, {
                        config: s,
                        dir: e.dir
                    });
                    d.set(e.id, t);
                }
                r.setNode(e.id, {
                    ...e
                });
            }
        }));
        for (let e of i)f && _(e) && await p(l, e), r.setEdge(e.start, e.end, {
            ...e
        }, e.id), n.edges.some((t)=>t.id === e.id) || n.edges.push(e);
        if (globalThis.mermaidCaptureSizes) {
            let { captureNodeSizes: r } = await t(async ()=>{
                let { captureNodeSizes: e } = await import(`./sizeCapture-INFHLROL-B0uUizjq.js`).then(async (m)=>{
                    await m.__tla;
                    return m;
                });
                return {
                    captureNodeSizes: e
                };
            }, __vite__mapDeps([0,1]));
            r(e, n);
        }
        return {
            graph: r,
            groups: c,
            nodeElements: d
        };
    }
    n(w, `createGraphWithElements`);
    let E, D, O, k, A, j, M, N, F, L, R, B, V;
    T = new Map;
    E = new Map;
    D = new Map;
    O = n(()=>{
        E.clear(), D.clear(), T.clear();
    }, `clear`);
    k = n((e, t)=>{
        let n = E.get(t) || [];
        return r.trace(`In isDescendant`, t, ` `, e, ` = `, n.includes(e)), n.includes(e);
    }, `isDescendant`);
    A = n((e, t)=>{
        let n = E.get(t) || [];
        return r.info(`Descendants of `, t, ` is `, n), r.info(`Edge is `, e), e.v === t || e.w === t ? !1 : n ? n.includes(e.v) || k(e.v, t) || k(e.w, t) || n.includes(e.w) : (r.debug(`Tilt, `, t, `,not in descendants`), !1);
    }, `edgeInCluster`);
    j = n((e, t, n, i)=>{
        r.debug(`Copying children of `, e, `root`, i, `data`, t.node(e), i);
        let a = t.children(e) || [];
        e !== i && a.push(e), r.debug(`Copying (nodes) clusterId`, e, `nodes`, a), a.forEach((a)=>{
            if (t.children(a).length > 0) j(a, t, n, i);
            else {
                let o = t.node(a);
                r.info(`cp `, a, ` to `, i, ` with parent `, e), n.setNode(a, o), i !== t.parent(a) && (r.debug(`Setting parent`, a, t.parent(a)), n.setParent(a, t.parent(a))), e !== i && a !== e ? (r.debug(`Setting parent`, a, e), n.setParent(a, e)) : (r.info(`In copy `, e, `root`, i, `data`, t.node(e), i), r.debug(`Not Setting parent for node=`, a, `cluster!==rootId`, e !== i, `node!==clusterId`, a !== e));
                let s = t.edges(a);
                r.debug(`Copying Edges`, s), s.forEach((a)=>{
                    r.info(`Edge`, a);
                    let o = t.edge(a.v, a.w, a.name);
                    r.info(`Edge data`, o, i);
                    try {
                        A(a, i) ? (r.info(`Copying as `, a.v, a.w, o, a.name), n.setEdge(a.v, a.w, o, a.name), r.info(`newGraph edges `, n.edges(), n.edge(n.edges()[0]))) : r.info(`Skipping copy of edge `, a.v, `-->`, a.w, ` rootId: `, i, ` clusterId:`, e);
                    } catch (e) {
                        r.error(e);
                    }
                });
            }
            r.debug(`Removing node`, a), t.removeNode(a);
        });
    }, `copy`);
    M = n((e, t)=>{
        let n = t.children(e), r = [
            ...n
        ];
        for (let i of n)D.set(i, e), r = [
            ...r,
            ...M(i, t)
        ];
        return r;
    }, `extractDescendants`);
    N = n((e, t, n)=>{
        let r = e.edges().filter((e)=>e.v === t || e.w === t), i = e.edges().filter((e)=>e.v === n || e.w === n), a = r.map((e)=>({
                v: e.v === t ? n : e.v,
                w: e.w === t ? t : e.w
            })), o = i.map((e)=>({
                v: e.v,
                w: e.w
            }));
        return a.filter((e)=>o.some((t)=>e.v === t.v && e.w === t.w));
    }, `findCommonEdges`);
    P = n((e, t, n)=>{
        let i = t.children(e);
        if (r.trace(`Searching children of id `, e, i), i.length < 1) return e;
        let a;
        for (let e of i){
            let r = P(e, t, n), i = N(t, n, r);
            if (r) if (i.length > 0) a = r;
            else return r;
        }
        return a;
    }, `findNonClusterChild`);
    F = n((e)=>!T.has(e) || !T.get(e).externalConnections ? e : T.has(e) ? T.get(e).id : e, `getAnchorId`);
    I = n((e, t)=>{
        if (!e || t > 10) {
            r.debug(`Opting out, no graph `);
            return;
        } else r.debug(`Opting in, graph `);
        e.nodes().forEach(function(t) {
            e.children(t).length > 0 && (r.debug(`Cluster identified`, t, ` Replacement id in edges: `, P(t, e, t)), E.set(t, M(t, e)), T.set(t, {
                id: P(t, e, t),
                clusterData: e.node(t)
            }));
        }), e.nodes().forEach(function(t) {
            let n = e.children(t), i = e.edges();
            n.length > 0 ? (r.debug(`Cluster identified`, t, E), i.forEach((e)=>{
                k(e.v, t) ^ k(e.w, t) && (r.debug(`Edge: `, e, ` leaves cluster `, t), r.debug(`Descendants of XXX `, t, `: `, E.get(t)), T.get(t).externalConnections = !0);
            })) : r.debug(`Not a cluster `, t, E);
        });
        for (let t of T.keys()){
            let n = T.get(t).id, r = e.parent(n);
            r !== t && T.has(r) && !T.get(r).externalConnections && (T.get(t).id = r);
            let i = e.edges().some((e)=>e.v === t);
            if (n && T.get(t)?.externalConnections && i && B(e, n, t)) {
                let r = V(e, t, e.parent(n));
                r && (T.get(t).id = r);
            }
        }
        e.edges().forEach(function(t) {
            let n = e.edge(t);
            r.debug(`Edge ` + t.v + ` -> ` + t.w + `: ` + JSON.stringify(t)), r.debug(`Edge ` + t.v + ` -> ` + t.w + `: ` + JSON.stringify(e.edge(t)));
            let i = t.v, a = t.w;
            if (r.debug(`Fix XXX`, T, `ids:`, t.v, t.w, `Translating: `, T.get(t.v), ` --- `, T.get(t.w)), T.get(t.v) || T.get(t.w)) {
                if (r.debug(`Fixing and trying - removing XXX`, t.v, t.w, t.name), i = F(t.v), a = F(t.w), e.removeEdge(t.v, t.w, t.name), i !== t.v) {
                    let r = e.parent(i);
                    T.get(r).externalConnections = !0, n.fromCluster = t.v;
                }
                if (a !== t.w) {
                    let r = e.parent(a);
                    T.get(r).externalConnections = !0, n.toCluster = t.w;
                }
                r.debug(`Fix Replacing with XXX`, i, a, t.name), e.setEdge(i, a, n, t.name);
            }
        }), L(e, 0), r.trace(T);
    }, `adjustClustersAndEdges`);
    L = n((e, t)=>{
        if (t > 10) {
            r.error(`Bailing out`);
            return;
        }
        let n = e.nodes(), i = !1;
        for (let t of n){
            let n = e.children(t);
            i ||= n.length > 0;
        }
        if (!i) {
            r.debug(`Done, no node has children`, e.nodes());
            return;
        }
        r.debug(`Nodes = `, n, t);
        for (let i of n)if (r.debug(`Extracting node`, i, T, T.has(i) && !T.get(i).externalConnections, !e.parent(i), e.node(i), e.children(`D`), ` Depth `, t), !T.has(i)) r.debug(`Not a cluster`, i, t);
        else if (!T.get(i).externalConnections && e.children(i) && e.children(i).length > 0) {
            r.debug(`Cluster without external connections, without a parent and with children`, i, t);
            let n = e.graph().rankdir === `TB` ? `LR` : `TB`;
            T.get(i)?.clusterData?.dir && (n = T.get(i).clusterData.dir, r.debug(`Fixing dir`, T.get(i).clusterData.dir, n));
            let a = new o({
                multigraph: !0,
                compound: !0
            }).setGraph({
                rankdir: n,
                nodesep: 50,
                ranksep: 50,
                marginx: 8,
                marginy: 8
            }).setDefaultEdgeLabel(function() {
                return {};
            });
            j(i, e, a, i), e.setNode(i, {
                clusterNode: !0,
                id: i,
                clusterData: T.get(i).clusterData,
                label: T.get(i).label,
                graph: a
            });
        } else r.debug(`Cluster ** `, i, ` **not meeting the criteria !externalConnections:`, !T.get(i).externalConnections, ` no parent: `, !e.parent(i), ` children `, e.children(i) && e.children(i).length > 0, e.children(`D`), t), r.debug(T);
        n = e.nodes(), r.debug(`New list of nodes`, n);
        for (let i of n){
            let n = e.node(i);
            r.debug(` Now next level`, i, n), n?.clusterNode && L(n.graph, t + 1);
        }
    }, `extractor`);
    R = n((e, t)=>{
        if (t.length === 0) return [];
        let n = Object.assign([], t);
        return t.forEach((t)=>{
            let r = R(e, e.children(t));
            n = [
                ...n,
                ...r
            ];
        }), n;
    }, `sorter`);
    z = n((e)=>R(e, e.children()), `sortNodesByHierarchy`);
    B = n((e, t, n)=>{
        let r = e.parent(t);
        for(; r && r !== n;){
            let t = T.get(r);
            if (t && !t.externalConnections) return !0;
            r = e.parent(r);
        }
        return !1;
    }, `isNodeInExtractableCluster`);
    V = n((e, t, n)=>{
        let r = e.children(t) ?? [];
        for (let i of r){
            if (i === n || k(i, n)) continue;
            let r = P(i, e, t);
            if (r && !B(e, r, t)) return r;
        }
        return null;
    }, `findSafeAnchorNode`);
    H = function({ prepareLayout: e, measureLayout: t, runLayoutCore: r, paintLayout: i, afterPaint: a, paintOptions: o }) {
        let s = t ?? W;
        return n(async function(t, n, c, l) {
            let u = n.select(`g`);
            (c?.insertMarkers ?? v)(u, t.markers, t.type, t.diagramId), U();
            let d = {
                element: u,
                helpers: c,
                options: l
            };
            d.preparedLayout = await e?.(t, d);
            let f = await s(t, d), p = await r(t, d), m = {
                ...d,
                measure: f
            };
            i ? await i(t, m, p) : await G(t, m, o), await a?.(t, m, p);
        }, `render`);
    };
    n(H, `createCommonLayoutRenderer`);
    U = function() {
        f(), ee(), b(), O();
    };
    n(U, `clearLayoutRenderState`);
    W = async function(e, { element: t }) {
        return await w(t, e);
    };
    n(W, `defaultMeasureLayout`);
    G = async function(e, t, n = {}) {
        let { measure: r } = t, { groups: i } = r;
        for (let r of n.getNodes?.(e, t) ?? e.nodes)n.skipNode?.(r, t) || await K(i, r, t, n);
        let a = J(e.nodes);
        for (let r of e.edges)Y(r, n) || await X(i, r, a, e, n, t);
    };
    n(G, `paintLayoutData`);
    async function K(e, t, n, r) {
        t.clusterNode ? l(t) : q(t, n, r) ? await y(e.clusters, t) : l(t);
    }
    n(K, `paintLayoutNode`);
    function q(e, t, n) {
        return e.isGroup === !0 && (n.isCluster?.(e, t) ?? !0);
    }
    n(q, `shouldPaintAsCluster`);
    function J(e) {
        let t = new Map;
        for (let n of e)n?.id && t.set(n.id, n);
        return t;
    }
    n(J, `buildNodeLookup`);
    function Y(e, t) {
        return e.isLayoutOnly || !!t.skipEdge?.(e);
    }
    n(Y, `shouldSkipPaintEdge`);
    async function X(e, t, n, r, i, a) {
        let o = m(e.edgePaths, {
            ...t
        }, i.clusterDb ?? new Map, r.type, Z(t.start, t, n, a, i), Z(t.end, t, n, a, i), r.diagramId, Q(t, i));
        _(t) && (g.has(t.id) || await p(e.edgeLabels, t), $(t, o));
    }
    n(X, `paintLayoutEdge`);
    function Z(e, t, n, r, i) {
        return i.getEdgeNode?.(e, t, r) ?? (e ? n.get(e) ?? {} : {});
    }
    n(Z, `getRenderedNode`);
    function Q(e, t) {
        return typeof t.skipIntersect == `function` ? t.skipIntersect(e) : t.skipIntersect ?? !1;
    }
    n(Q, `shouldSkipIntersect`);
    function $(e, t) {
        let n = t?.updatedPath ?? t?.originalPath, { subGraphTitleTotalMargin: a } = u({
            flowchart: i().flowchart ?? {}
        });
        if (e.label) {
            let i = g.get(e.id), o = e.x, c = e.y;
            if (n) {
                let i = s.calcLabelPosition(n);
                r.debug(`Moving label ` + e.label + ` from (`, o, `,`, c, `) to (`, i.x, `,`, i.y, `) abc88`), t?.updatedPath && (o = i.x, c = i.y);
            }
            i.attr(`transform`, `translate(${o}, ${c + a / 2})`);
        }
        if (e?.startLabelLeft) {
            let t = h.get(e.id).startLeft, r = e?.x, i = e?.y;
            if (n) {
                let t = s.calcTerminalLabelPosition(e.arrowTypeStart ? 10 : 0, `start_left`, n);
                r = t.x, i = t.y;
            }
            t.attr(`transform`, `translate(${r}, ${i})`);
        }
        if (e.startLabelRight) {
            let t = h.get(e.id).startRight, r = e.x, i = e.y;
            if (n) {
                let t = s.calcTerminalLabelPosition(e.arrowTypeStart ? 10 : 0, `start_right`, n);
                r = t.x, i = t.y;
            }
            t.attr(`transform`, `translate(${r}, ${i})`);
        }
        if (e.endLabelLeft) {
            let t = h.get(e.id).endLeft, r = e.x, i = e.y;
            if (n) {
                let t = s.calcTerminalLabelPosition(e.arrowTypeEnd ? 10 : 0, `end_left`, n);
                r = t.x, i = t.y;
            }
            t.attr(`transform`, `translate(${r}, ${i})`);
        }
        if (e.endLabelRight) {
            let t = h.get(e.id).endRight, r = e.x, i = e.y;
            if (n) {
                let t = s.calcTerminalLabelPosition(e.arrowTypeEnd ? 10 : 0, `end_right`, n);
                r = t.x, i = t.y;
            }
            t.attr(`transform`, `translate(${r}, ${i})`);
        }
    }
    n($, `positionRenderedEdgeLabel`);
});
export { x as a, C as c, H as i, G as l, U as n, W as o, T as r, P as s, I as t, z as u, __tla };
