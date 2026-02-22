
import dotenv from 'dotenv';
dotenv.config();
import { UserModel } from '../models/postgres/User';
import bcrypt from 'bcryptjs';

const testRegistration = async () => {
    try {
        console.log("Testing Registration...");
        const phone = "+998901234567";
        const password = "password123";
        const name = "TestUser";
        const surname = "TestSurname";
        const age = 25;

        // 1. Check if user exists
        console.log("Checking if user exists...");
        const existingUser = await UserModel.findByPhone(phone);
        if (existingUser) {
            console.log("User already exists:", existingUser);
            // Optionally delete to test creation
            // await pool.query('DELETE FROM users WHERE phone = $1', [phone]);
        }

        // 2. Hash password
        console.log("Hashing password...");
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 3. Create user
        console.log("Creating user...");
        const newUser = await UserModel.create(phone, passwordHash, name, surname, age);
        console.log("User created successfully:", newUser);

        process.exit(0);
    } catch (error) {
        console.error("Registration Test Failed:", error);
        process.exit(1);
    }
};

testRegistration();
