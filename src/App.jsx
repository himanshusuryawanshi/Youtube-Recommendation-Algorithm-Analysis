import React, { useState, useEffect, useRef } from 'react';
import realData from './real_data.json'; 
import { 
  Share2, 
  Activity, 
  Users, 
  RefreshCw, 
  PlayCircle, 
  TrendingUp, 
  Info, 
  AlertCircle,
  MousePointer2,
  Maximize2,
  HelpCircle,
  Search,
  ServerCrash
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend,
  BarChart,
  Bar
} from 'recharts';

useEffect(() => {
  // FORCE USE OF LOCAL DATA ON STARTUP
  if (realData) {
    processData(realData.nodes, realData.links);
    setStatus("success"); 
  } else {
    // Only fetch if we don't have local data
    fetchData("Veritasium");
  }
}, []);

// --- CONFIGURATION ---
const TOPICS = ['Gaming', 'Tech', 'Vlogs', 'Music', 'Education', 'News'];
const COLORS = ['#FF4D4D', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'];

// --- ALGORITHMS ---

const formatSubs = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

const calculateGini = (nodes) => {
  const values = nodes.map(n => n.pagerank).sort((a, b) => a - b);
  const n = values.length;
  if (n === 0) return 0;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i + 1) * values[i];
    den += values[i];
  }
  return (2 * num) / (n * den) - (n + 1) / n;
};

const generateLorenzData = (nodes) => {
  const sorted = [...nodes].sort((a, b) => a.pagerank - b.pagerank);
  const totalWealth = sorted.reduce((sum, n) => sum + n.pagerank, 0);
  let cumWealth = 0;
  const points = [{ percent: 0, actual: 0, perfect: 0 }];
  
  sorted.forEach((node, i) => {
    cumWealth += node.pagerank;
    if (i % Math.ceil(nodes.length / 20) === 0 || i === sorted.length - 1) {
      points.push({
        percent: Math.round(((i + 1) / nodes.length) * 100),
        actual: (cumWealth / totalWealth) * 100,
        perfect: ((i + 1) / nodes.length) * 100
      });
    }
  });
  return points;
};

// --- MOCK DATA GENERATOR (Fallback) ---
const generateMockData = (nodeCount = 50) => {
  const nodes = [];
  const links = [];
  
  for (let i = 0; i < nodeCount; i++) {
    const topicIndex = Math.floor(Math.random() * TOPICS.length);
    const isSuperStar = i < 4; 
    const baseSubs = isSuperStar ? 10000000 + Math.random() * 50000000 : 10000 + Math.random() * 900000; 
    
    nodes.push({
      id: `channel_${i}`,
      name: isSuperStar ? `TopCreator ${i+1}` : `Channel ${i+1}`,
      topic: TOPICS[topicIndex],
      color: COLORS[topicIndex],
      subscribers: Math.floor(baseSubs),
      x: Math.random() * 800,
      y: Math.random() * 500,
      vx: 0,
      vy: 0,
      mass: isSuperStar ? 10 : 2, 
      pagerank: 0,
      isDragging: false
    });
  }

  nodes.forEach(source => {
    const recommendationCount = 2 + Math.floor(Math.random() * 3);
    for (let j = 0; j < recommendationCount; j++) {
      let target;
      const rand = Math.random();
      
      if (rand < 0.65) {
        target = nodes[Math.floor(Math.random() * 5)]; 
      } else if (rand < 0.9) {
        const sameTopicNodes = nodes.filter(n => n.topic === source.topic && n.id !== source.id);
        target = sameTopicNodes[Math.floor(Math.random() * sameTopicNodes.length)];
      } else {
        target = nodes[Math.floor(Math.random() * nodes.length)];
      }

      if (target && target.id !== source.id) {
        const exists = links.some(l => l.source === source.id && l.target === target.id);
        if (!exists) links.push({ source: source.id, target: target.id });
      }
    }
  });

  return { nodes, links };
};

const calculatePageRank = (nodes, links, iterations = 20) => {
  const n = nodes.length;
  let ranks = {};
  nodes.forEach(node => ranks[node.id] = 1 / n);

  for (let i = 0; i < iterations; i++) {
    const newRanks = {};
    const damping = 0.85;
    const outboundMap = {};
    links.forEach(l => {
      if (!outboundMap[l.source]) outboundMap[l.source] = [];
      outboundMap[l.source].push(l.target);
    });

    nodes.forEach(target => {
      let incomingScore = 0;
      const inboundLinks = links.filter(l => l.target === target.id);
      inboundLinks.forEach(link => {
        const sourceOutCount = outboundMap[link.source] ? outboundMap[link.source].length : 0;
        if (sourceOutCount > 0) incomingScore += ranks[link.source] / sourceOutCount;
      });
      newRanks[target.id] = (1 - damping) / n + damping * incomingScore;
    });
    ranks = newRanks;
  }
  
  const maxRank = Math.max(...Object.values(ranks));
  return nodes.map(node => ({
    ...node,
    pagerank: ranks[node.id],
    normalizedRank: ranks[node.id] / maxRank
  }));
};

// --- VISUALIZATION COMPONENT ---
const NetworkCanvas = ({ nodes, links }) => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [draggedNode, setDraggedNode] = useState(null);
  
  const simulationNodes = useRef([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    simulationNodes.current = nodes.map(n => ({ 
      ...n,
      x: n.x || Math.random() * 800,
      y: n.y || Math.random() * 600,
      vx: 0, vy: 0
    }));
  }, [nodes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0) return;
    
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    
    const ctx = canvas.getContext('2d');
    let animationId;

    // Physics Constants
    const REPULSION = 500;
    const SPRING_LEN = 120;
    const SPRING_K = 0.04;
    const CENTER_GRAVITY = 0.0002;
    const DAMPING = 0.85;
    const MAX_SPEED = 8;

    const tick = () => {
      const currentNodes = simulationNodes.current;
      
      currentNodes.forEach(node => {
        if (node.isDragging) return;

        let fx = 0, fy = 0;

        // Repulsion
        currentNodes.forEach(other => {
          if (node.id === other.id) return;
          const dx = node.x - other.x;
          const dy = node.y - other.y;
          const distSq = dx * dx + dy * dy || 1;
          const dist = Math.sqrt(distSq);
          if (dist < 400) {
            const force = REPULSION / distSq;
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          }
        });

        // Attraction
        links.forEach(link => {
          const targetId = link.source === node.id ? link.target : (link.target === node.id ? link.source : null);
          if (targetId) {
            const target = currentNodes.find(n => n.id === targetId);
            if (target) {
              const dx = target.x - node.x;
              const dy = target.y - node.y;
              const dist = Math.sqrt(dx * dx + dy * dy) || 1;
              const force = (dist - SPRING_LEN) * SPRING_K;
              fx += (dx / dist) * force;
              fy += (dy / dist) * force;
            }
          }
        });

        // Center Gravity
        fx += (dimensions.width / 2 - node.x) * CENTER_GRAVITY * (node.mass || 1);
        fy += (dimensions.height / 2 - node.y) * CENTER_GRAVITY * (node.mass || 1);

        node.vx = (node.vx + fx) * DAMPING;
        node.vy = (node.vy + fy) * DAMPING;
        
        const v = Math.sqrt(node.vx * node.vx + node.vy * node.vy);
        if (v > MAX_SPEED) {
           node.vx = (node.vx / v) * MAX_SPEED;
           node.vy = (node.vy / v) * MAX_SPEED;
        }

        node.x += node.vx;
        node.y += node.vy;

        // Wall Bounce
        const PAD = 20;
        if (node.x < PAD) { node.x = PAD; node.vx *= -0.5; }
        if (node.x > dimensions.width - PAD) { node.x = dimensions.width - PAD; node.vx *= -0.5; }
        if (node.y < PAD) { node.y = PAD; node.vy *= -0.5; }
        if (node.y > dimensions.height - PAD) { node.y = dimensions.height - PAD; node.vy *= -0.5; }
      });

      // Render
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);

      // Links
      links.forEach(link => {
        const source = currentNodes.find(n => n.id === link.source);
        const target = currentNodes.find(n => n.id === link.target);
        if (source && target) {
          const isHighlighted = hoveredNode && (hoveredNode.id === source.id || hoveredNode.id === target.id);
          const isDimmed = hoveredNode && !isHighlighted;
          
          ctx.beginPath();
          ctx.lineWidth = isHighlighted ? 2 : 1;
          ctx.strokeStyle = isHighlighted ? '#FFF' : (isDimmed ? '#334155' : '#475569');
          ctx.globalAlpha = isHighlighted ? 1 : (isDimmed ? 0.1 : 0.5);
          ctx.moveTo(source.x, source.y);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();

          if (!isDimmed) {
             const angle = Math.atan2(target.y - source.y, target.x - source.x);
             const dist = Math.sqrt(Math.pow(target.x - source.x, 2) + Math.pow(target.y - source.y, 2));
             const arrowPos = dist > 40 ? dist - 25 : dist / 2;
             const ax = source.x + Math.cos(angle) * arrowPos;
             const ay = source.y + Math.sin(angle) * arrowPos;
             
             ctx.beginPath();
             ctx.moveTo(ax, ay);
             ctx.lineTo(ax - 8 * Math.cos(angle - Math.PI / 6), ay - 8 * Math.sin(angle - Math.PI / 6));
             ctx.lineTo(ax - 8 * Math.cos(angle + Math.PI / 6), ay - 8 * Math.sin(angle + Math.PI / 6));
             ctx.fillStyle = ctx.strokeStyle;
             ctx.fill();
          }
        }
      });
      ctx.globalAlpha = 1;

      // Nodes
      currentNodes.forEach(node => {
        const isHovered = hoveredNode?.id === node.id;
        const isConnected = hoveredNode && links.some(l => 
          (l.source === hoveredNode.id && l.target === node.id) || 
          (l.target === hoveredNode.id && l.source === node.id)
        );
        const isDimmed = hoveredNode && !isHovered && !isConnected;
        const radius = 8 + (node.normalizedRank || 0) * 25;

        ctx.beginPath();
        if (isDimmed) {
          ctx.fillStyle = '#334155';
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.fillStyle = node.color;
          // ENHANCED GLOW EFFECT
          if (node.normalizedRank > 0.4 || isHovered) {
             // Pulsing effect
             const pulse = isHovered ? 5 : Math.sin(Date.now() * 0.005) * 2;
             ctx.shadowBlur = (isHovered ? 25 : 15) + pulse;
             ctx.shadowColor = node.color;
          } else {
             ctx.shadowBlur = 0;
          }
          
          ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI);
          ctx.fill();
          
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = isHovered ? 3 : 1.5;
          ctx.stroke();

          if (node.normalizedRank > 0.2 || isHovered) {
            ctx.fillStyle = '#FFF';
            ctx.font = isHovered ? 'bold 12px sans-serif' : '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            const textWidth = ctx.measureText(node.name).width;
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = '#000';
            ctx.roundRect(node.x - textWidth/2 - 4, node.y + radius + 6, textWidth + 8, 16, 4);
            ctx.fill();
            
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#FFF';
            ctx.fillText(node.name, node.x, node.y + radius + 14);
          }
        }
      });

      animationId = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(animationId);
  }, [links, hoveredNode, dimensions]);

  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseDown = (e) => {
    const { x, y } = getPos(e);
    const node = simulationNodes.current.find(n => {
       const r = 15 + (n.normalizedRank || 0) * 20;
       return Math.hypot(n.x - x, n.y - y) < r + 5;
    });
    if (node) {
      node.isDragging = true;
      node.vx = 0; node.vy = 0;
      setDraggedNode(node);
    }
  };

  const handleMouseMove = (e) => {
    const { x, y } = getPos(e);
    if (draggedNode) {
      draggedNode.x = x; draggedNode.y = y;
    } else {
      const node = simulationNodes.current.find(n => {
         const r = 15 + (n.normalizedRank || 0) * 20;
         return Math.hypot(n.x - x, n.y - y) < r;
      });
      setHoveredNode(node || null);
    }
  };

  const handleMouseUp = () => {
    if (draggedNode) {
      draggedNode.isDragging = false;
      setDraggedNode(null);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full h-[550px] bg-slate-900 rounded-xl overflow-hidden shadow-2xl border border-slate-700">
      <canvas
        ref={canvasRef}
        className={`block touch-none ${draggedNode ? 'cursor-grabbing' : 'cursor-default'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur-sm border border-slate-700 p-3 rounded-lg shadow-lg pointer-events-none">
        <h4 className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2">Topic Legend</h4>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {TOPICS.map((t, i) => (
            <div key={t} className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full shadow-[0_0_8px]" style={{background: COLORS[i], boxShadow: `0 0 8px ${COLORS[i]}`}} />
               <span className="text-slate-200 text-xs font-medium">{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [inputName, setInputName] = useState("Veritasium");
  const [data, setData] = useState({ nodes: [], links: [] });
  const [metrics, setMetrics] = useState({ gini: 0, topInfluencers: [] });
  const [lorenzData, setLorenzData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const processData = (nodes, links) => {
    // Re-calculate PageRank just to be safe or use pre-calc if robust
    const rankedNodes = calculatePageRank(nodes, links);
    const maxRank = Math.max(...rankedNodes.map(n => n.pagerank || 0)) || 1;
    
    const processedNodes = rankedNodes.map(n => ({
      ...n,
      normalizedRank: (n.pagerank || 0) / maxRank,
      mass: n.subscribers > 5000000 ? 10 : (n.subscribers > 100000 ? 5 : 2)
    }));

    const gini = calculateGini(processedNodes);
    const lorenz = generateLorenzData(processedNodes);
    const topInfluencers = [...processedNodes].sort((a, b) => b.pagerank - a.pagerank).slice(0, 5);

    setData({ nodes: processedNodes, links });
    setMetrics({ gini, topInfluencers });
    setLorenzData(lorenz);
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`http://127.0.0.1:5000/analyze?name=${encodeURIComponent(inputName)}`);
      if (!response.ok) throw new Error("Backend unavailable or channel not found");
      
      const result = await response.json();
      processData(result.nodes, result.links);
    } catch (err) {
      console.error("Search failed, falling back to simulation:", err);
      setError("Backend connection failed. Showing simulated data.");
      
      // Fallback to mock data
      // const mock = generateMockData(50); // Commented mock fallback
      // processData(mock.nodes, mock.links);
    } finally {
      setLoading(false);
    }
  };

  // --- INITIAL LOAD: USE REAL DATA BY DEFAULT ---
  useEffect(() => { 
    // FOR LOCAL USE: To use real data, verify 'realData' is imported correctly.
    // For PREVIEW: We fall back to simulation if realData isn't found (handled by import error fallback in bundler, or uncomment mock above)
    
    if (typeof realData !== 'undefined') {
        processData(realData.nodes, realData.links);
    } else {
        // If you are running this in Preview and realData is commented out, use mock
        const mock = generateMockData(50);
        processData(mock.nodes, mock.links);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans p-6">
      <header className="mb-8 flex flex-col md:flex-row justify-between items-center gap-4 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Share2 className="text-red-600"/> YouTube Fairness Auditor
          </h1>
          <p className="text-gray-500">Algorithmic Auditing & Network Analysis</p>
        </div>
        
        <form onSubmit={handleSearch} className="flex gap-2 w-full md:w-auto">
          <div className="relative">
            <input 
              type="text" 
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-64 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Enter Channel Name..."
            />
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-lg font-medium transition-all active:scale-95 disabled:opacity-70 disabled:scale-100 shadow-md"
          >
            {loading ? <RefreshCw className="animate-spin" size={18}/> : <PlayCircle size={18} />}
            {loading ? "Crawling..." : "Analyze"}
          </button>
        </form>
      </header>

      {error && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <ServerCrash size={20} />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto space-y-8">
        
        {/* GRAPH SECTION */}
        <section>
          <div className="flex justify-between items-center mb-4">
             <h2 className="text-lg font-bold flex gap-2 items-center"><Activity className="text-blue-600"/> Network Graph</h2>
             <span className="text-sm bg-white px-3 py-1 rounded border text-gray-500 font-medium">
               {data.nodes.length} Channels • {data.links.length} Recommendations
             </span>
          </div>
          <NetworkCanvas nodes={data.nodes} links={data.links} />
        </section>

        {/* METRICS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 group relative">
            <h3 className="text-gray-500 font-medium mb-1 flex items-center gap-2 cursor-help">
              Gini Coefficient (Inequality) <HelpCircle size={14}/>
            </h3>
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-3 bg-slate-800 text-white text-xs rounded shadow-xl z-20">
              <p className="font-bold mb-1">Measures Fairness:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>0.0 = Perfect Equality (Fair)</li>
                <li>1.0 = Total Inequality (Unfair)</li>
              </ul>
            </div>
            
            <div className="text-4xl font-bold text-slate-900">{metrics.gini.toFixed(3)}</div>
            <div className={`text-xs font-medium px-2 py-1 rounded w-fit mt-2 ${metrics.gini > 0.4 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
              {metrics.gini > 0.4 ? "High Inequality Detected" : "Balanced Distribution"}
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 group relative">
            <h3 className="text-gray-500 font-medium mb-1 flex items-center gap-2 cursor-help">
              Top Influencer Share <HelpCircle size={14}/>
            </h3>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-64 p-3 bg-slate-800 text-white text-xs rounded shadow-xl z-20">
              <p>Percentage of total network visibility held by just the #1 channel. A high number means one creator monopolizes recommendations.</p>
            </div>
            <div className="text-4xl font-bold text-slate-900">{metrics.topInfluencers.length > 0 ? (metrics.topInfluencers[0].pagerank * 100).toFixed(1) : 0}%</div>
            <p className="text-xs text-gray-400 mt-2">Visibility held by the #1 Channel</p>
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-gray-500 font-medium mb-1">Network Size</h3>
            <div className="text-4xl font-bold text-slate-900">{data.nodes.length}</div>
            <p className="text-xs text-gray-400 mt-2">Total Channels Analyzed</p>
          </div>
        </div>

        {/* CHARTS & LEADERBOARD */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-96">
            <h3 className="font-bold mb-6 text-slate-800 flex items-center gap-2">Lorenz Curve Analysis <Info size={16} className="text-gray-400"/></h3>
            <ResponsiveContainer width="100%" height="90%">
              <LineChart data={lorenzData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0"/>
                <XAxis dataKey="percent" label={{value: 'Cumulative % Channels', position: 'insideBottom', offset: -10, fontSize: 12}} tickLine={false} axisLine={false} tick={{fontSize: 12}}/>
                <YAxis label={{value: 'Cumulative % Visibility', angle: -90, position: 'insideLeft', fontSize: 12}} tickLine={false} axisLine={false} tick={{fontSize: 12}}/>
                <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}/>
                <Legend verticalAlign="top" height={36}/>
                <Line type="monotone" dataKey="perfect" stroke="#10B981" strokeDasharray="5 5" name="Perfect Equality" dot={false} strokeWidth={2}/>
                <Line type="monotone" dataKey="actual" stroke="#EF4444" strokeWidth={3} name="Actual Distribution" dot={false}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 h-96 flex flex-col">
            <h3 className="font-bold mb-4 text-slate-800 flex items-center justify-between">
              Most Visible Channels
              <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-1 rounded">By PageRank</span>
            </h3>
            <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {metrics.topInfluencers.map((node, i) => (
                <div key={node.id} className="flex justify-between items-center p-3 hover:bg-slate-50 rounded-lg border border-transparent hover:border-slate-100 transition-colors group">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-300 w-5 text-center group-hover:text-blue-500 transition-colors">#{i+1}</span>
                    <div className="w-2.5 h-8 rounded-full shadow-sm" style={{background: node.color}}></div>
                    <div className="flex flex-col">
                      <span className="font-bold text-sm text-slate-900 truncate w-32">{node.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{node.topic}</span>
                        <span className="text-[10px] text-slate-400">• {formatSubs(node.subscribers)} Subs</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-bold text-slate-900">{(node.pagerank * 100).toFixed(1)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-80">
          <h3 className="font-bold mb-4 text-slate-800">Topic Distribution</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={TOPICS.map((t, i) => ({ name: t, count: data.nodes.filter(n => n.topic === t).length, fill: COLORS[i] }))}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0"/>
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{fontSize: 12}}/>
              <YAxis tickLine={false} axisLine={false} tick={{fontSize: 12}}/>
              <Tooltip cursor={{fill: '#F1F5F9'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}}/>
              <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Channels" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </main>
    </div>
  );
}