import mongoose from 'mongoose';

const BusinessSchema = new mongoose.Schema({
  name: { type: String, required: true },
  ein: { type: String },
  notes: { type: String },
}, { _id: true });

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  passwordHash: { type: String, required: true },
  companyName: { type: String },
  businesses: { type: [BusinessSchema], default: [] },
  tags: { type: [String], default: [] },
}, { timestamps: true });

export const User = mongoose.models.User || mongoose.model('User', UserSchema);
