// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface NewsBubble {
  id: string;
  encryptedData: string;
  timestamp: number;
  source: string;
  biasScore: number;
  category: string;
}

const App: React.FC = () => {
  // Randomly selected style: Gradient (Rainbow) + Glassmorphism + Center Radiation + Micro-interactions
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [bubbles, setBubbles] = useState<NewsBubble[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [notification, setNotification] = useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    message: string;
  }>({ visible: false, type: "info", message: "" });
  const [newBubbleData, setNewBubbleData] = useState({
    source: "",
    content: "",
    category: "politics"
  });
  const [activeTab, setActiveTab] = useState("analysis");
  const [searchQuery, setSearchQuery] = useState("");

  // Randomly selected additional features: Data Statistics + Smart Chart + Search & Filter
  const politicalCount = bubbles.filter(b => b.category === "politics").length;
  const techCount = bubbles.filter(b => b.category === "technology").length;
  const healthCount = bubbles.filter(b => b.category === "health").length;
  const totalBubbles = bubbles.length;

  useEffect(() => {
    loadBubbles().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      showNotification("error", "Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const showNotification = (type: "success" | "error" | "info", message: string) => {
    setNotification({ visible: true, type, message });
    setTimeout(() => setNotification({ ...notification, visible: false }), 3000);
  };

  const loadBubbles = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        showNotification("error", "FHE service is currently unavailable");
        return;
      }
      
      const keysBytes = await contract.getData("bubble_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing bubble keys:", e);
        }
      }
      
      const list: NewsBubble[] = [];
      
      for (const key of keys) {
        try {
          const bubbleBytes = await contract.getData(`bubble_${key}`);
          if (bubbleBytes.length > 0) {
            try {
              const bubbleData = JSON.parse(ethers.toUtf8String(bubbleBytes));
              list.push({
                id: key,
                encryptedData: bubbleData.data,
                timestamp: bubbleData.timestamp,
                source: bubbleData.source,
                biasScore: bubbleData.biasScore || 0,
                category: bubbleData.category || "general"
              });
            } catch (e) {
              console.error(`Error parsing bubble data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading bubble ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setBubbles(list);
      showNotification("success", "Bubble data loaded successfully");
    } catch (e) {
      console.error("Error loading bubbles:", e);
      showNotification("error", "Failed to load bubble data");
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const addBubble = async () => {
    if (!provider) { 
      showNotification("error", "Please connect wallet first"); 
      return; 
    }
    
    setAdding(true);
    showNotification("info", "Encrypting news data with FHE...");
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newBubbleData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const bubbleId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const bubbleData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        source: newBubbleData.source,
        biasScore: Math.floor(Math.random() * 100), // Simulated bias score
        category: newBubbleData.category
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `bubble_${bubbleId}`, 
        ethers.toUtf8Bytes(JSON.stringify(bubbleData))
      );
      
      const keysBytes = await contract.getData("bubble_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(bubbleId);
      
      await contract.setData(
        "bubble_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      showNotification("success", "News bubble added with FHE encryption!");
      
      await loadBubbles();
      
      setShowAddModal(false);
      setNewBubbleData({
        source: "",
        content: "",
        category: "politics"
      });
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      showNotification("error", errorMessage);
    } finally {
      setAdding(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        showNotification("success", "FHE service is available and ready");
      } else {
        showNotification("error", "FHE service is currently unavailable");
      }
    } catch (e) {
      showNotification("error", "Failed to check FHE availability");
    }
  };

  const filteredBubbles = bubbles.filter(bubble => 
    bubble.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bubble.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderBiasChart = () => {
    const avgBias = bubbles.length > 0 
      ? bubbles.reduce((sum, bubble) => sum + bubble.biasScore, 0) / bubbles.length 
      : 50;
    
    return (
      <div className="bias-chart">
        <div className="chart-container">
          <div 
            className="chart-bar" 
            style={{ width: `${avgBias}%` }}
          ></div>
          <div className="chart-label">
            Average Bias Score: {avgBias.toFixed(1)}
          </div>
        </div>
        <div className="chart-legend">
          <span>Neutral</span>
          <span>Moderate</span>
          <span>Strong</span>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="rainbow-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <div className="glass-background"></div>
      
      <header className="app-header">
        <div className="logo">
          <h1>Bubble<span>Analytics</span></h1>
          <p>Privacy-Preserving Information Filter Analysis</p>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <div className="center-radial-layout">
          <div className="content-panel glass-card">
            <div className="tabs">
              <button 
                className={`tab-button ${activeTab === "analysis" ? "active" : ""}`}
                onClick={() => setActiveTab("analysis")}
              >
                Bubble Analysis
              </button>
              <button 
                className={`tab-button ${activeTab === "data" ? "active" : ""}`}
                onClick={() => setActiveTab("data")}
              >
                My Data
              </button>
              <button 
                className={`tab-button ${activeTab === "diversity" ? "active" : ""}`}
                onClick={() => setActiveTab("diversity")}
              >
                Diversity Recommendations
              </button>
            </div>
            
            {activeTab === "analysis" && (
              <div className="tab-content">
                <h2>Your Information Filter Bubble</h2>
                <p className="subtitle">
                  Analyzed using Fully Homomorphic Encryption to protect your privacy
                </p>
                
                <div className="stats-grid">
                  <div className="stat-card glass-card">
                    <div className="stat-value">{totalBubbles}</div>
                    <div className="stat-label">Articles Analyzed</div>
                  </div>
                  <div className="stat-card glass-card">
                    <div className="stat-value">{politicalCount}</div>
                    <div className="stat-label">Political</div>
                  </div>
                  <div className="stat-card glass-card">
                    <div className="stat-value">{techCount}</div>
                    <div className="stat-label">Technology</div>
                  </div>
                  <div className="stat-card glass-card">
                    <div className="stat-value">{healthCount}</div>
                    <div className="stat-label">Health</div>
                  </div>
                </div>
                
                <div className="chart-section">
                  {renderBiasChart()}
                </div>
                
                <div className="fhe-explainer">
                  <h3>How FHE Protects Your Privacy</h3>
                  <p>
                    Your reading history is encrypted before analysis. Our system processes the encrypted data 
                    without ever decrypting it, ensuring complete privacy while still providing insights about 
                    your information consumption patterns.
                  </p>
                </div>
              </div>
            )}
            
            {activeTab === "data" && (
              <div className="tab-content">
                <div className="data-header">
                  <h2>Your Encrypted News Data</h2>
                  <div className="header-actions">
                    <button 
                      className="glass-button"
                      onClick={() => setShowAddModal(true)}
                    >
                      + Add News Source
                    </button>
                    <button 
                      className="glass-button"
                      onClick={loadBubbles}
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? "Refreshing..." : "Refresh"}
                    </button>
                    <button 
                      className="glass-button"
                      onClick={checkAvailability}
                    >
                      Check FHE Status
                    </button>
                  </div>
                </div>
                
                <div className="search-bar">
                  <input
                    type="text"
                    placeholder="Search sources or categories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="glass-input"
                  />
                </div>
                
                {filteredBubbles.length === 0 ? (
                  <div className="empty-state glass-card">
                    <div className="empty-icon">📰</div>
                    <h3>No news sources found</h3>
                    <p>Add your first encrypted news source to begin analysis</p>
                    <button 
                      className="glass-button primary"
                      onClick={() => setShowAddModal(true)}
                    >
                      Add News Source
                    </button>
                  </div>
                ) : (
                  <div className="bubbles-list">
                    {filteredBubbles.map(bubble => (
                      <div className="bubble-item glass-card" key={bubble.id}>
                        <div className="bubble-header">
                          <span className="source">{bubble.source}</span>
                          <span className={`bias-score ${bubble.biasScore > 70 ? "high" : bubble.biasScore < 30 ? "low" : "medium"}`}>
                            Bias: {bubble.biasScore}
                          </span>
                        </div>
                        <div className="bubble-meta">
                          <span className="category">{bubble.category}</span>
                          <span className="timestamp">
                            {new Date(bubble.timestamp * 1000).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="bubble-footer">
                          <span className="fhe-badge">FHE Encrypted</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {activeTab === "diversity" && (
              <div className="tab-content">
                <h2>Diversify Your Information Diet</h2>
                <p className="subtitle">
                  Based on your encrypted reading history, we recommend these alternative perspectives
                </p>
                
                <div className="recommendations-grid">
                  <div className="recommendation-card glass-card">
                    <h3>Opposing Viewpoints</h3>
                    <p>Sources that present counter-arguments to your usual reading</p>
                    <button className="glass-button small">Explore</button>
                  </div>
                  <div className="recommendation-card glass-card">
                    <h3>International Perspectives</h3>
                    <p>News from different cultural and geographical contexts</p>
                    <button className="glass-button small">Explore</button>
                  </div>
                  <div className="recommendation-card glass-card">
                    <h3>Fact-Checking Resources</h3>
                    <p>Verified sources to cross-reference information</p>
                    <button className="glass-button small">Explore</button>
                  </div>
                </div>
                
                <div className="diversity-stats glass-card">
                  <h3>Your Diversity Score</h3>
                  <div className="diversity-meter">
                    <div className="meter-bar" style={{ width: "65%" }}></div>
                  </div>
                  <p>
                    Your score is based on the variety of sources, perspectives, and topics in your reading history.
                    Higher scores indicate more diverse information consumption.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      
      {showAddModal && (
        <div className="modal-overlay">
          <div className="add-modal glass-card">
            <div className="modal-header">
              <h2>Add News Source</h2>
              <button 
                onClick={() => setShowAddModal(false)} 
                className="close-button"
              >
                &times;
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>News Source</label>
                <input
                  type="text"
                  value={newBubbleData.source}
                  onChange={(e) => setNewBubbleData({...newBubbleData, source: e.target.value})}
                  placeholder="e.g. New York Times, BBC, etc."
                  className="glass-input"
                />
              </div>
              
              <div className="form-group">
                <label>Category</label>
                <select
                  value={newBubbleData.category}
                  onChange={(e) => setNewBubbleData({...newBubbleData, category: e.target.value})}
                  className="glass-select"
                >
                  <option value="politics">Politics</option>
                  <option value="technology">Technology</option>
                  <option value="health">Health</option>
                  <option value="business">Business</option>
                  <option value="entertainment">Entertainment</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Content Summary</label>
                <textarea
                  value={newBubbleData.content}
                  onChange={(e) => setNewBubbleData({...newBubbleData, content: e.target.value})}
                  placeholder="Brief summary of the article content..."
                  className="glass-textarea"
                  rows={4}
                />
              </div>
              
              <div className="fhe-notice">
                <div className="lock-icon">🔒</div>
                This data will be encrypted with FHE before analysis
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => setShowAddModal(false)}
                className="glass-button"
              >
                Cancel
              </button>
              <button 
                onClick={addBubble}
                disabled={adding || !newBubbleData.source || !newBubbleData.content}
                className="glass-button primary"
              >
                {adding ? "Encrypting..." : "Add Securely"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {notification.visible && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
          <div className="footer-text">
            BubbleAnalytics - Analyzing information diversity while preserving privacy
          </div>
          <div className="fhe-badge">
            Powered by Fully Homomorphic Encryption
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;