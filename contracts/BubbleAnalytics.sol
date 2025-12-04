// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract BubbleAnalytics is SepoliaConfig {
    struct EncryptedReadingHistory {
        uint256 userId;
        euint32[] articleIds;        // Encrypted article identifiers
        euint32[] categoryScores;    // Encrypted category preference scores
        euint32[] sentimentScores;   // Encrypted sentiment scores
        uint256 timestamp;
    }
    
    struct BubbleAnalysis {
        euint32 diversityScore;     // Encrypted diversity score
        euint32[] biasVector;       // Encrypted bias vector
        euint32[] recommendedArticles; // Encrypted recommended articles
        bool isComplete;
    }
    
    struct DecryptedResult {
        uint32 diversityScore;
        uint32[] biasVector;
        uint32[] recommendedArticles;
        bool isRevealed;
    }
    
    // Contract state
    mapping(uint256 => EncryptedReadingHistory) public userReadingHistory;
    mapping(uint256 => BubbleAnalysis) public analysisResults;
    mapping(uint256 => DecryptedResult) public decryptedResults;
    
    // Category definitions
    string[] public categories;
    mapping(string => uint256) public categoryIndex;
    
    // Decryption requests tracking
    mapping(uint256 => uint256) private requestToUserId;
    
    // Events
    event ReadingHistorySubmitted(uint256 indexed userId, uint256 timestamp);
    event AnalysisRequested(uint256 indexed userId);
    event AnalysisCompleted(uint256 indexed userId);
    event ResultRevealed(uint256 indexed userId);
    
    modifier onlyUser(uint256 userId) {
        // Access control placeholder (user verification)
        _;
    }
    
    /// @notice Initialize categories
    constructor() {
        categories = ["Politics", "Technology", "Health", "Environment", "Economy"];
        for (uint i = 0; i < categories.length; i++) {
            categoryIndex[categories[i]] = i;
        }
    }
    
    /// @notice Submit encrypted reading history
    function submitReadingHistory(
        uint256 userId,
        euint32[] memory articleIds,
        euint32[] memory categoryScores,
        euint32[] memory sentimentScores
    ) public onlyUser(userId) {
        require(
            categoryScores.length == categories.length,
            "Invalid category scores length"
        );
        
        userReadingHistory[userId] = EncryptedReadingHistory({
            userId: userId,
            articleIds: articleIds,
            categoryScores: categoryScores,
            sentimentScores: sentimentScores,
            timestamp: block.timestamp
        });
        
        emit ReadingHistorySubmitted(userId, block.timestamp);
    }
    
    /// @notice Request filter bubble analysis
    function requestAnalysis(uint256 userId) public onlyUser(userId) {
        require(userReadingHistory[userId].timestamp > 0, "No reading history");
        
        emit AnalysisRequested(userId);
    }
    
    /// @notice Store encrypted analysis results
    function storeAnalysisResults(
        uint256 userId,
        euint32 diversityScore,
        euint32[] memory biasVector,
        euint32[] memory recommendedArticles
    ) public {
        require(
            biasVector.length == categories.length,
            "Invalid bias vector length"
        );
        
        analysisResults[userId] = BubbleAnalysis({
            diversityScore: diversityScore,
            biasVector: biasVector,
            recommendedArticles: recommendedArticles,
            isComplete: true
        });
        
        decryptedResults[userId] = DecryptedResult({
            diversityScore: 0,
            biasVector: new uint32[](0),
            recommendedArticles: new uint32[](0),
            isRevealed: false
        });
        
        emit AnalysisCompleted(userId);
    }
    
    /// @notice Request decryption of analysis results
    function requestResultDecryption(uint256 userId) public onlyUser(userId) {
        BubbleAnalysis storage result = analysisResults[userId];
        require(result.isComplete, "Analysis not complete");
        require(!decryptedResults[userId].isRevealed, "Already revealed");
        
        // Prepare all ciphertexts for decryption
        uint256 totalElements = 1 + result.biasVector.length + result.recommendedArticles.length;
        bytes32[] memory ciphertexts = new bytes32[](totalElements);
        
        uint256 counter = 0;
        ciphertexts[counter++] = FHE.toBytes32(result.diversityScore);
        
        for (uint i = 0; i < result.biasVector.length; i++) {
            ciphertexts[counter++] = FHE.toBytes32(result.biasVector[i]);
        }
        
        for (uint i = 0; i < result.recommendedArticles.length; i++) {
            ciphertexts[counter++] = FHE.toBytes32(result.recommendedArticles[i]);
        }
        
        // Request decryption
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAnalysisResult.selector);
        requestToUserId[reqId] = userId;
    }
    
    /// @notice Callback for decrypted analysis results
    function decryptAnalysisResult(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 userId = requestToUserId[requestId];
        require(userId != 0, "Invalid request");
        
        BubbleAnalysis storage aResult = analysisResults[userId];
        DecryptedResult storage dResult = decryptedResults[userId];
        require(!dResult.isRevealed, "Already revealed");
        
        // Verify decryption proof
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        // Process decrypted values
        uint32[] memory results = abi.decode(cleartexts, (uint32[]));
        
        dResult.diversityScore = results[0];
        
        // Bias vector
        dResult.biasVector = new uint32[](aResult.biasVector.length);
        for (uint i = 0; i < aResult.biasVector.length; i++) {
            dResult.biasVector[i] = results[1 + i];
        }
        
        // Recommended articles
        uint startIndex = 1 + aResult.biasVector.length;
        dResult.recommendedArticles = new uint32[](aResult.recommendedArticles.length);
        for (uint i = 0; i < aResult.recommendedArticles.length; i++) {
            dResult.recommendedArticles[i] = results[startIndex + i];
        }
        
        dResult.isRevealed = true;
        
        emit ResultRevealed(userId);
    }
    
    /// @notice Calculate encrypted diversity score
    function calculateDiversityScore(uint256 userId) public view returns (euint32) {
        EncryptedReadingHistory storage history = userReadingHistory[userId];
        require(history.timestamp > 0, "No reading history");
        
        // Simplified diversity calculation: entropy of category distribution
        euint32 total = FHE.asEuint32(0);
        euint32 sumSquares = FHE.asEuint32(0);
        
        for (uint i = 0; i < history.categoryScores.length; i++) {
            total = FHE.add(total, history.categoryScores[i]);
        }
        
        for (uint i = 0; i < history.categoryScores.length; i++) {
            euint32 proportion = FHE.div(history.categoryScores[i], total);
            euint32 squared = FHE.mul(proportion, proportion);
            sumSquares = FHE.add(sumSquares, squared);
        }
        
        // Diversity = 1 - sum(proportion^2)
        return FHE.sub(FHE.asEuint32(100), FHE.mul(sumSquares, FHE.asEuint32(100)));
    }
    
    /// @notice Calculate encrypted bias vector
    function calculateBiasVector(uint256 userId) public view returns (euint32[] memory) {
        EncryptedReadingHistory storage history = userReadingHistory[userId];
        require(history.timestamp > 0, "No reading history");
        
        euint32[] memory biasVector = new euint32[](categories.length);
        euint32 totalSentiment = FHE.asEuint32(0);
        
        // Calculate total sentiment
        for (uint i = 0; i < history.sentimentScores.length; i++) {
            totalSentiment = FHE.add(totalSentiment, history.sentimentScores[i]);
        }
        
        // Calculate average sentiment per category
        for (uint i = 0; i < categories.length; i++) {
            if (FHE.gt(history.categoryScores[i], FHE.asEuint32(0))) {
                biasVector[i] = FHE.div(
                    FHE.mul(history.sentimentScores[i], FHE.asEuint32(100)),
                    totalSentiment
                );
            } else {
                biasVector[i] = FHE.asEuint32(50); // Neutral if no data
            }
        }
        
        return biasVector;
    }
    
    /// @notice Generate encrypted recommendations
    function generateRecommendations(uint256 userId) public view returns (euint32[] memory) {
        euint32[] memory recommendations = new euint32[](3);
        
        // Simplified: recommend articles from least represented categories
        euint32 minScore = FHE.asEuint32(100);
        uint256 minIndex = 0;
        
        for (uint i = 0; i < categories.length; i++) {
            ebool isSmaller = FHE.lt(userReadingHistory[userId].categoryScores[i], minScore);
            minScore = FHE.select(isSmaller, userReadingHistory[userId].categoryScores[i], minScore);
            minIndex = FHE.select(isSmaller, i, minIndex);
        }
        
        // Recommend articles from the least represented category
        recommendations[0] = FHE.asEuint32(minIndex * 1000 + 1);
        recommendations[1] = FHE.asEuint32(minIndex * 1000 + 2);
        recommendations[2] = FHE.asEuint32(minIndex * 1000 + 3);
        
        return recommendations;
    }
    
    /// @notice Get encrypted reading history
    function getEncryptedReadingHistory(uint256 userId) public view returns (
        euint32[] memory articleIds,
        euint32[] memory categoryScores,
        euint32[] memory sentimentScores
    ) {
        EncryptedReadingHistory storage history = userReadingHistory[userId];
        require(history.timestamp > 0, "No reading history");
        return (history.articleIds, history.categoryScores, history.sentimentScores);
    }
    
    /// @notice Get encrypted analysis result
    function getEncryptedAnalysisResult(uint256 userId) public view returns (
        euint32 diversityScore,
        euint32[] memory biasVector,
        euint32[] memory recommendedArticles
    ) {
        BubbleAnalysis storage r = analysisResults[userId];
        require(r.isComplete, "Analysis not complete");
        return (r.diversityScore, r.biasVector, r.recommendedArticles);
    }
    
    /// @notice Get decrypted analysis result
    function getDecryptedAnalysisResult(uint256 userId) public view returns (
        uint32 diversityScore,
        uint32[] memory biasVector,
        uint32[] memory recommendedArticles,
        bool isRevealed
    ) {
        DecryptedResult storage r = decryptedResults[userId];
        return (r.diversityScore, r.biasVector, r.recommendedArticles, r.isRevealed);
    }
    
    /// @notice Add new category
    function addCategory(string memory category) public {
        require(categoryIndex[category] == 0, "Category already exists");
        categories.push(category);
        categoryIndex[category] = categories.length - 1;
    }
}