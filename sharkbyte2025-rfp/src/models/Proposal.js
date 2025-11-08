import mongoose from 'mongoose';

const ProposalSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  rfpId: { type: mongoose.Schema.Types.ObjectId, ref: 'Rfp', required: true },
  formData: { type: mongoose.Schema.Types.Mixed, default: {} },
  attachments: { type: [String], default: [] },
  status: { type: String, enum: ['draft', 'submitted'], default: 'draft' },
  exportMeta: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

export const Proposal = mongoose.models.Proposal || mongoose.model('Proposal', ProposalSchema);
