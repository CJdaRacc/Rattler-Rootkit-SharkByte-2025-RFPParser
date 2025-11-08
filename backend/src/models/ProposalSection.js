import mongoose from 'mongoose';

const ProposalSectionSchema = new mongoose.Schema(
  {
    proposalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Proposal', required: true },
    templateSectionKey: String,
    title: String,
    mdBody: String,
    coverage: [String], // requirement IDs
    citations: [Object],
  },
  { timestamps: true }
);

export default mongoose.model('ProposalSection', ProposalSectionSchema);
