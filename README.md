# YouTube Fairness Auditor 🎥⚖️

A data science tool to visualize and quantify algorithmic bias in YouTube's recommendation network.

---

## 🔍 Project Overview

YouTube's recommendation algorithm is often criticized as a "Black Box" that creates echo chambers and unfairly favors established creators.  
This project **reverse-engineers** that box.

By crawling the recommendation graph starting from seed channels, we construct a directed network where nodes are channels and edges are algorithmic recommendations.  
We then apply Social Network Analysis (SNA) metrics to audit the system for fairness.

---

## ⭐ Key Features

- **Live Network Graph:** Interactive, force-directed visualization of channel clusters.  
- **Algorithmic Auditing:** Uses PageRank to measure visibility influence.  
- **Inequality Metrics:** Computes the Gini Coefficient and plots the Lorenz Curve to quantify visibility inequality.  
- **Echo Chamber Detection:** Reveals topic clusters such as Gaming, News, Education, etc.

---

## Simulation


https://github.com/user-attachments/assets/433d7e1a-ba6c-41a8-b431-26ebad7dd757




**Note:** To verify results locally, run the Python crawler script.

---

## 🛠️ Architecture

This project uses a **Hybrid Architecture** enabling both deep offline analysis and rich browser-based interactivity.

### **1. The Crawler (Python / Flask)**

- Uses the YouTube Data API v3  
- Performs a BFS crawl of the recommendation graph  
- Computes graph metrics (PageRank, Centrality) using NetworkX  
- Exposes results via `/analyze` API endpoint  

### **2. The Dashboard (React / Vite)**

- Fetches data from the Flask backend  
- Renders the network using a custom Canvas-based physics engine  
- Visualizes charts using Recharts  

---

## 🚀 How to Run Locally

### **Prerequisites**

- Node.js (v16+)  
- Python (v3.9+)  
- A Google Cloud API key with YouTube Data API v3 enabled  

---

### **1. Clone the Repository**

```bash
git clone https://github.com/yourusername/youtube-fairness-auditor.git
cd youtube-fairness-auditor
```

### **2. Setup the Backend (Python)**
Create and activate virtual environment:

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
```

Install dependencies:
```bash
pip install flask flask-cors google-api-python-client networkx numpy
```

Add your API key:

Edit server.py:
API_KEY = "YOUR_API_KEY_HERE"

Run the backend
```bash
python server.py
```

You should see:
Running on http://127.0.0.1:5000

### **3. Setup Frontend (React)**

Install dependencies:
```bash
npm install
```
Run the development server:
```bash
npm run dev
```

You'll see:
Local: http://localhost:5173

## 4. Usage Instructions

- Open the dashboard  
- Enter any channel name (e.g., **Veritasium**)  
- The system crawls recommendations  
- The real-time network graph will generate  
- Explore fairness metrics in the dashboard  

---

## 📊 Methodology Details

### Crawler Strategy

Because `relatedToVideoId` was deprecated, the crawler uses a **Topic Cluster Search** strategy:

1. Query YouTube by a video's title  
2. Fetch semantically similar videos  
3. Build channel-to-channel edges  
4. Apply BFS to expand the recommendation network  

This approximates YouTube’s implicit similarity model.

---

### Fairness Metric: Gini Coefficient

- **0.0** → Perfect equality  
- **1.0** → Extreme inequality  
- Real-world YouTube networks typically fall between **0.4–0.6**  

A **Lorenz Curve** is also generated to visualize inequality patterns.

---

## 🤝 Contributing

Contributions are welcome! You can help improve:

- Graph crawling  
- Fairness metrics  
- Visualization performance  
- Dashboard design  

Submit a PR anytime!
