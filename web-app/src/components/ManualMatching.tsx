import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { Opportunity, Match, FilterOptions } from '../types';

interface ManualMatchingProps {}

interface BatchJob {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  processed_count?: number;
  total_count?: number;
  estimated_completion?: string;
  error_message?: string;
  started_at: Date;
}

const ManualMatching: React.FC<ManualMatchingProps> = () => {
  const queryClient = useQueryClient();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [matchResult, setMatchResult] = useState<Match | null>(null);
  const [error, setError] = useState<string>('');
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [refreshingEmbeddings, setRefreshingEmbeddings] = useState(false);

  // Load recent opportunities on component mount
  useEffect(() => {
    loadRecentOpportunities();
  }, []);

  // Poll for batch job status updates
  useEffect(() => {
    const activeBatchJobs = batchJobs.filter(job =>
      job.status === 'pending' || job.status === 'running'
    );

    if (activeBatchJobs.length === 0) return;

    const pollInterval = setInterval(async () => {
      const updatedJobs = await Promise.all(
        activeBatchJobs.map(async (job) => {
          try {
            const status = await apiService.getBatchMatchingStatus(job.job_id);
            return { ...job, ...status };
          } catch (error) {
            console.error(`Failed to get status for job ${job.job_id}:`, error);
            return { ...job, status: 'failed' as const, error_message: 'Status check failed' };
          }
        })
      );

      setBatchJobs(prev =>
        prev.map(job => {
          const updated = updatedJobs.find(u => u.job_id === job.job_id);
          const wasRunning = job.status === 'running' || job.status === 'pending';
          const isNowComplete = updated && updated.status === 'completed';

          // If job just completed, invalidate matches cache to refresh the UI
          if (wasRunning && isNowComplete) {
            console.log(`Batch job ${job.job_id} completed - refreshing matches cache`);
            queryClient.invalidateQueries({ queryKey: ['matches'] });
            queryClient.invalidateQueries({ queryKey: ['match-stats'] });
          }

          return updated || job;
        })
      );
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [batchJobs, queryClient]);

  const loadRecentOpportunities = async () => {
    try {
      const response = await apiService.getOpportunities(1, 50, {
        posted_after: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
      });
      setOpportunities(response.items);
    } catch (error) {
      console.error('Failed to load opportunities:', error);
      setError('Failed to load recent opportunities');
    }
  };

  const handleSingleMatch = async () => {
    if (!selectedOpportunity) {
      setError('Please select an opportunity to match against');
      return;
    }

    setIsLoading(true);
    setError('');
    setMatchResult(null);

    try {
      const match = await apiService.triggerManualMatch(selectedOpportunity);
      setMatchResult(match);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to run match');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchMatching = async (options?: {
    opportunity_filters?: FilterOptions;
    force_refresh?: boolean;
    batch_size?: number;
  }) => {
    setError('');

    try {
      const result = await apiService.runBatchMatching(options);

      const newJob: BatchJob = {
        job_id: result.job_id,
        status: 'pending',
        started_at: new Date()
      };

      setBatchJobs(prev => [...prev, newJob]);

      // Show success message
      alert(`Batch matching started successfully!\nJob ID: ${result.job_id}\n${result.message}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to start batch matching');
    }
  };

  const handleRefreshEmbeddings = async () => {
    setRefreshingEmbeddings(true);
    setError('');

    try {
      const result = await apiService.refreshCompanyEmbeddings();
      alert(`Company embeddings refreshed successfully!\nProcessed ${result.processed_documents} documents.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to refresh embeddings');
    } finally {
      setRefreshingEmbeddings(false);
    }
  };

  const formatConfidenceLevel = (level: string) => {
    const colors = {
      'HIGH': 'text-green-600 bg-green-100',
      'MEDIUM': 'text-yellow-600 bg-yellow-100',
      'LOW': 'text-red-600 bg-red-100',
      'NO_MATCH': 'text-gray-600 bg-gray-100'
    };
    return colors[level as keyof typeof colors] || 'text-gray-600 bg-gray-100';
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Manual Matching</h1>
        <p className="text-gray-600 mb-6">
          Trigger manual matching processes to find relevant opportunities for your company profile.
        </p>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Single Opportunity Matching */}
        <div className="border rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">🎯 Single Opportunity Match</h2>
          <p className="text-gray-600 mb-4">
            Test the matching algorithm against a specific opportunity.
          </p>

          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Opportunity
              </label>
              <select
                value={selectedOpportunity}
                onChange={(e) => setSelectedOpportunity(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              >
                <option value="">Choose an opportunity...</option>
                {opportunities.map((opp) => (
                  <option key={opp.notice_id} value={opp.notice_id}>
                    {opp.title} ({opp.naics_code}) - {new Date(opp.posted_date).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSingleMatch}
              disabled={isLoading || !selectedOpportunity}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Matching...
                </>
              ) : (
                '▶️ Run Match'
              )}
            </button>
          </div>

          {matchResult && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-3">Match Result</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Total Score</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {(matchResult.total_score * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Confidence Level</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${formatConfidenceLevel(matchResult.confidence_level)}`}>
                    {matchResult.confidence_level}
                  </span>
                </div>
              </div>

              {matchResult.match_reasons && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Match Reasons:</p>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                    {matchResult.match_reasons.map((reason, index) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {matchResult.recommendations && (
                <div className="mt-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Recommendations:</p>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                    {matchResult.recommendations.map((rec, index) => (
                      <li key={index}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Batch Matching */}
        <div className="border rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">🚀 Batch Matching</h2>
          <p className="text-gray-600 mb-4">
            Run matching against multiple opportunities in bulk.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => handleBatchMatching()}
              className="px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center gap-2"
            >
              🔄 Run Full Batch
            </button>
            <button
              onClick={() => handleBatchMatching({
                opportunity_filters: {
                  posted_after: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
                }
              })}
              className="px-4 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              📅 Last 7 Days
            </button>
            <button
              onClick={() => handleBatchMatching({ force_refresh: true })}
              className="px-4 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center justify-center gap-2"
            >
              ♻️ Force Refresh
            </button>
          </div>
        </div>

        {/* Company Profile Maintenance */}
        <div className="border rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">🔧 Profile Maintenance</h2>
          <p className="text-gray-600 mb-4">
            Refresh your company's embeddings after uploading new documents.
          </p>

          <button
            onClick={handleRefreshEmbeddings}
            disabled={refreshingEmbeddings}
            className="px-6 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {refreshingEmbeddings ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Refreshing...
              </>
            ) : (
              '🔄 Refresh Company Embeddings'
            )}
          </button>
        </div>

        {/* Batch Job Status */}
        {batchJobs.length > 0 && (
          <div className="border rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">📊 Batch Job Status</h2>
            <div className="space-y-4">
              {batchJobs.map((job) => (
                <div key={job.job_id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-medium">Job ID: {job.job_id}</p>
                      <p className="text-sm text-gray-600">
                        Started: {job.started_at.toLocaleString()}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      job.status === 'completed' ? 'bg-green-100 text-green-800' :
                      job.status === 'running' ? 'bg-blue-100 text-blue-800' :
                      job.status === 'failed' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {job.status.toUpperCase()}
                    </span>
                  </div>

                  {job.progress !== undefined && (
                    <div className="mb-2">
                      <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>Progress</span>
                        <span>{job.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${job.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {job.processed_count !== undefined && job.total_count !== undefined && (
                    <p className="text-sm text-gray-600">
                      Processed: {job.processed_count} / {job.total_count} opportunities
                    </p>
                  )}

                  {job.estimated_completion && (
                    <p className="text-sm text-gray-600">
                      Estimated completion: {job.estimated_completion}
                    </p>
                  )}

                  {job.error_message && (
                    <p className="text-sm text-red-600 mt-2">
                      Error: {job.error_message}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManualMatching;