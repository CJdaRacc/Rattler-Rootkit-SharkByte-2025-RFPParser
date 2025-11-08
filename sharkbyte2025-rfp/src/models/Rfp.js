import mongoose from 'mongoose';

const RequirementSchema = new mongoose.Schema({
  id: { type: String, required: true },
  clause_ref: { type: String },
  title: { type: String },
  category: { type: String },
  priority: { type: String, enum: ['high', 'medium', 'low'], default: 'low' },
  text_snippet: { type: String },
  evidence_required: { type: [String], default: [] },
  submission_format: { type: String },
  budget_caps: { type: mongoose.Schema.Types.Mixed },
  due_dates: { type: [String], default: [] },
  keywords: { type: [String], default: [] },
}, { _id: false });

const KeywordSuggestionSchema = new mongoose.Schema({
  keywords: { type: [String], default: [] },
  promptContext: { type: mongoose.Schema.Types.Mixed },
  redacted_excerpt: { type: String },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const RfpSchema = new mongoose.Schema({
  original_filename: { type: String },
  uploadMeta: { type: mongoose.Schema.Types.Mixed },
  extractedText: { type: String },
  extractedTextHash: { type: String },
  parsedRequirements: { type: [RequirementSchema], default: [] },
  keywordSuggestions: { type: [KeywordSuggestionSchema], default: [] },
}, { timestamps: true });

export const Rfp = mongoose.models.Rfp || mongoose.model('Rfp', RfpSchema);
