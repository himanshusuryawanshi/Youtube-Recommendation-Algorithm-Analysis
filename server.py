from flask import Flask, request, jsonify
from flask_cors import CORS
import networkx as nx
import numpy as np
from googleapiclient.discovery import build
from collections import deque

app = Flask(__name__)
CORS(app)

# --- CONFIGURATION ---
API_KEY = "AIzaSyASLgbzmXWhfDnu3LgSuOD70fLrjBv6_vk" 
MAX_NODES = 50 

def get_service():
    return build('youtube', 'v3', developerKey=API_KEY)

# --- CORE LOGIC ---

def search_channel_id(youtube, query):
    try:
        request = youtube.search().list(
            part="snippet", q=query, type="channel", maxResults=1
        )
        response = request.execute()
        if response['items']:
            return response['items'][0]['snippet']['channelId']
    except Exception as e:
        print(f"Search Error: {e}")
    return None

def build_graph(seed_id):
    youtube = get_service()
    G = nx.DiGraph()
    queue = deque([seed_id])
    processed = set()
    
    def get_details(ch_id):
        try:
            res = youtube.channels().list(part="snippet,statistics,contentDetails", id=ch_id).execute()
            if res['items']:
                item = res['items'][0]
                return {
                    'id': item['id'],
                    'title': item['snippet']['title'],
                    'uploads': item['contentDetails']['relatedPlaylists']['uploads'],
                    'subs': int(item['statistics'].get('subscriberCount', 0))
                }
        except: pass
        return None

    print(f"--- Starting Live Crawl for {seed_id} ---")
    
    while queue and len(G.nodes) < MAX_NODES:
        curr_id = queue.popleft()
        if curr_id in processed: continue
        processed.add(curr_id)
        
        details = get_details(curr_id)
        if not details: continue
        
        G.add_node(curr_id, label=details['title'], subscribers=details['subs'])
        print(f"Found: {details['title']}") # Debug print
        
        try:
            v_res = youtube.playlistItems().list(
                part="snippet", playlistId=details['uploads'], maxResults=2
            ).execute()
            
            for item in v_res.get('items', []):
                vid_title = item['snippet']['title']
                s_res = youtube.search().list(
                    part="snippet", q=vid_title, type="video", maxResults=3
                ).execute()
                
                for s_item in s_res.get('items', []):
                    rec_id = s_item['snippet']['channelId']
                    rec_title = s_item['snippet']['channelTitle']
                    
                    if rec_id and rec_id != curr_id:
                        if not G.has_node(rec_id):
                            G.add_node(rec_id, label=rec_title, subscribers=0)
                        
                        if G.has_edge(curr_id, rec_id):
                            G[curr_id][rec_id]['weight'] += 1
                        else:
                            G.add_edge(curr_id, rec_id, weight=1)
                        
                        if rec_id not in processed and rec_id not in queue:
                            queue.append(rec_id)
        except Exception as e:
            print(f"Error processing {details['title']}: {e}")

    return G

def analyze_and_format(G):
    if len(G) == 0: return {"nodes": [], "links": []}
    pagerank = nx.pagerank(G, weight='weight')
    
    nodes = []
    links = []
    topics = ['Gaming', 'Tech', 'Vlogs', 'Music', 'Education', 'News']
    colors = ['#FF4D4D', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']
    max_rank = max(pagerank.values()) if pagerank else 1

    for n_id, attrs in G.nodes(data=True):
        idx = sum(ord(c) for c in n_id) % len(topics)
        rank = pagerank.get(n_id, 0)
        nodes.append({
            "id": n_id,
            "name": attrs.get('label', n_id)[:20],
            "topic": topics[idx],
            "color": colors[idx],
            "subscribers": attrs.get('subscribers', 0),
            "pagerank": rank,
            "normalizedRank": rank / max_rank,
            "mass": 5 if rank > (max_rank * 0.5) else 2,
            "x": np.random.randint(100, 700),
            "y": np.random.randint(100, 500),
            "vx": 0, "vy": 0
        })
        
    for u, v, d in G.edges(data=True):
        links.append({"source": u, "target": v, "weight": d.get('weight', 1)})
        
    return {"nodes": nodes, "links": links}

@app.route('/analyze', methods=['GET'])
def analyze():
    channel_name = request.args.get('name')
    print(f"Received request for: {channel_name}")
    
    if not channel_name:
        return jsonify({"error": "Name required"}), 400
    
    youtube = get_service()
    seed_id = search_channel_id(youtube, channel_name)
    
    if not seed_id:
        return jsonify({"error": "Channel not found"}), 404
        
    graph = build_graph(seed_id)
    data = analyze_and_format(graph)
    
    print(f"Sending back {len(data['nodes'])} nodes.")
    return jsonify(data)

if __name__ == '__main__':
    # FIX: use_reloader=False prevents the importlib error on macOS
    app.run(debug=True, use_reloader=False, port=5000)