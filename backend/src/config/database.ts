import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDatabase = async (): Promise<void> => {
  await mongoose.connect(env.MONGO_URI);
};

export const disconnectDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
};

export const getDatabaseStatus = (): 'connected' | 'disconnected' =>
  mongoose.connection.readyState === mongoose.ConnectionStates.connected
    ? 'connected'
    : 'disconnected';
