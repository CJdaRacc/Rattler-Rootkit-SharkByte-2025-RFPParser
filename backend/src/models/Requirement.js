import mongoose from 'mongoose';

const RequirementSchema = new mongoose.Schema(
  {
    rfpId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rfp', required: true },
    clauseRef: String,
    title: String,
    textSnippet: String,
    category: String,
    priority: { type: String, enum: ['must', 'should', 'nice'], default: 'should' },
    evidenceRequired: [String],
    submissionFormat: Object,
    budgetCaps: Object,
    dueDates: Object,
    keywords: [String],
    coverageStatus: { type: String, enum: ['uncovered', 'partial', 'covered'], default: 'uncovered' },
  },
  { timestamps: true }
);

export default mongoose.model('Requirement', RequirementSchema);
