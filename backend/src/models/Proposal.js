import mongoose from 'mongoose';

const ProposalSchema = new mongoose.Schema(
  {
    rfpId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rfp', required: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
    status: { type: String, enum: ['draft', 'validating', 'ready'], default: 'draft' },
    exportedPaths: Object,
    name: String,
  },
  { timestamps: true }
);

export default mongoose.model('Proposal', ProposalSchema);
