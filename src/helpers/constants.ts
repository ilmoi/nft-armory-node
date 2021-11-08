import {Connection, PublicKey} from "@solana/web3.js";
import dotenv from 'dotenv';

dotenv.config()

console.log("CONNECTED TO:", process.env.NODE_URL);
export const CONN = new Connection(process.env.NODE_URL!);
export const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
