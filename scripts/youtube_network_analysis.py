import os
import networkx as nx
import pandas as pd
import matplotlib.pyplot as plt
import numpy as np
import json
from googleapiclient.discovery import build
from collections import deque

API_KEY = "AIzaSyBaN1lL8yYqG26UT7bpJCB9_FgK2DFfWE0" 
MAX_CHANNELS = 100

SEED_CHANNEL_IDS = [
    "UC-lHJZR3Gqxm24_Vd_AJ5Yw", # PewDiePie (Gaming)
    "UCX6OQ3DkcsbYNE6H8uQQuVA", # MrBeast (Entertainment)
    "UCq-Fj5jknLsUf-MWSy4_brA", # T-Series (Music) - CORRECTED ID
    "UCsooa4yRKGN_zEE8iknghZA", # TED-Ed (Education)
    "UCXuqSBlHAE6Xw-yeJA0Tunw", # Linus Tech Tips (Tech) - REPLACED MKBHD
]

def get_youtube_service():
    return build('youtube', 'v3', developerKey=API_KEY)

def get_channel_details(youtube, channel_id):
    """Fetches basic details for a channel."""
    try:
        request = youtube.channels().list(
            part="snippet,statistics,contentDetails",
            id=channel_id
        )
        response = request.execute()
        
        # Robust check for items
        if 'items' in response and len(response['items']) > 0:
            item = response['items'][0]
            sub_count = item['statistics'].get('subscriberCount', 0)
            return {
                'id': item['id'],
                'title': item['snippet']['title'],
                'uploads_playlist': item['contentDetails']['relatedPlaylists']['uploads'],
                'view_count': int(item['statistics']['viewCount']),
                'subscriber_count': int(sub_count)
            }
        else:
            print(f"Warning: Channel {channel_id} not found or private.")
            
    except Exception as e:
        print(f"Error fetching channel {channel_id}: {e}")
    return None

def get_recent_videos(youtube, playlist_id, limit=2):
    """Get recent video IDs AND Titles."""
    videos = []
    try:
        request = youtube.playlistItems().list(
            part="contentDetails,snippet", # Added snippet to get title
            playlistId=playlist_id,
            maxResults=limit
        )
        response = request.execute()
        for item in response.get('items', []):
            videos.append({
                'id': item['contentDetails']['videoId'],
                'title': item['snippet']['title']
            })
    except Exception as e:
        print(f"Error getting videos for playlist: {e}")
    return videos

def get_related_content(youtube, video_title, limit=5):
    """
    WORKAROUND: Since 'relatedToVideoId' is deprecated, we search 
    for the video title to find content in the same topic cluster.
    """
    related_channels = []
    try:
        request = youtube.search().list(
            part="snippet",
            q=video_title, 
            type="video",
            maxResults=limit
        )
        response = request.execute()
        for item in response.get('items', []):
            channel_id = item['snippet']['channelId']
            channel_title = item['snippet']['channelTitle'] 
            if channel_id:
                related_channels.append({'id': channel_id, 'title': channel_title})
    except Exception as e:
        print(f"Warning: Could not search for '{video_title[:15]}...': {e}")
    return related_channels

def build_network(youtube, seed_channel_ids, max_nodes=50):
    G = nx.DiGraph()
    queue = deque(seed_channel_ids)
    processed = set()
    
    print(f"--- Starting Crawl with {len(seed_channel_ids)} seeds ---")

    while queue and len(G.nodes) < max_nodes:
        current_channel_id = queue.popleft()
        
        if current_channel_id in processed:
            continue
            
        processed.add(current_channel_id)
        
        # 1. Get Channel Details
        details = get_channel_details(youtube, current_channel_id)
        if not details: 
            continue
            
        G.add_node(current_channel_id, label=details['title'], subscribers=details['subscriber_count'])
        print(f"[{len(G.nodes)}/{max_nodes}] Processed: {details['title']}")

        # 2. Get Videos (ID + Title)
        videos = get_recent_videos(youtube, details['uploads_playlist'])
        
        if not videos:
            print(f"   -> No videos found for {details['title']}")

        for vid_info in videos:
            # Pass TITLE to the new search function
            related_items = get_related_content(youtube, vid_info['title'])
            
            for item in related_items:
                rec_id = item['id']
                rec_title = item['title']
                
                if rec_id == current_channel_id: continue 

                # Ensure node exists with a LABEL immediately (even if not crawled yet)
                if not G.has_node(rec_id):
                    # Note: We don't have sub count for leaves yet, so default to 0
                    G.add_node(rec_id, label=rec_title, subscribers=0)

                # Add Edge
                if G.has_edge(current_channel_id, rec_id):
                    G[current_channel_id][rec_id]['weight'] += 1
                else:
                    G.add_edge(current_channel_id, rec_id, weight=1)
                
                # Add to queue
                if rec_id not in processed and rec_id not in queue:
                    queue.append(rec_id)
                    
                if len(G.nodes) >= max_nodes:
                    break
            if len(G.nodes) >= max_nodes:
                break
                
    return G

def analyze_fairness(G):
    print("\n--- Calculating Metrics ---")
    if len(G) == 0:
        return {}, 0

    pagerank = nx.pagerank(G, weight='weight')
    nx.set_node_attributes(G, pagerank, 'pagerank')
    
    values = list(pagerank.values())
    values = np.sort(values)
    n = len(values)
    if n == 0: return {}, 0
    
    index = np.arange(1, n + 1)
    gini = (((2 * np.sum(index * values)) / (n * np.sum(values))) - ((n + 1) / n))*10
    
    print(f"Gini Coefficient: {gini:.4f}")
    return pagerank, gini

def export_to_json(G, filename="src/real_data.json"):
    nodes = []
    links = []
    
    topics = ['Gaming', 'Tech', 'Vlogs', 'Music', 'Education', 'News']
    colors = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#6B7280']
    
    def get_hash_idx(s):
        return sum(ord(c) for c in s) % len(topics)

    for node_id, attributes in G.nodes(data=True):
        idx = get_hash_idx(node_id)
        # Use the label attribute we ensured is present
        name_label = attributes.get('label', node_id)
        
        nodes.append({
            "id": node_id,
            "name": name_label[:20], # Truncate for UI
            "topic": topics[idx],
            "color": colors[idx],
            "subscribers": attributes.get('subscribers', 0),
            "pagerank": attributes.get('pagerank', 0),
            "x": np.random.randint(100, 700),
            "y": np.random.randint(100, 500),
            "vx": 0,
            "vy": 0
        })

    for u, v, data in G.edges(data=True):
        links.append({
            "source": u,
            "target": v,
            "weight": data.get('weight', 1)
        })

    output = {"nodes": nodes, "links": links}
    
    try:
        # Save to both locations to be safe (script folder and src folder)
        with open(filename, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"\nSUCCESS! Data exported to: {filename}")
        print("You can now refresh your web app to see the real data.")
    except FileNotFoundError:
        print(f"\nWarning: Could not find '{filename}'. Saving to 'real_data.json' in current folder instead.")
        with open('real_data.json', 'w') as f:
            json.dump(output, f, indent=2)

if __name__ == "__main__":
    youtube = get_youtube_service()
    
    # 1. Build
    graph = build_network(youtube, SEED_CHANNEL_IDS, MAX_CHANNELS)
    
    # 2. Analyze
    pr_values, gini = analyze_fairness(graph)
    
    # 3. Export
    export_to_json(graph, "src/real_data.json")