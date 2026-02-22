"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = exports.register = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = require("../../models/postgres/User");
const register = async (req, res) => {
    try {
        const { phone, password, name, surname, age } = req.body;
        if (!phone || !password || !name) {
            return res.status(400).json({ message: 'Phone, password, and name are required' });
        }
        const existingUser = await User_1.UserModel.findByPhone(phone);
        if (existingUser) {
            return res.status(409).json({ message: 'User already exists' });
        }
        const salt = await bcryptjs_1.default.genSalt(10);
        const passwordHash = await bcryptjs_1.default.hash(password, salt);
        const newUser = await User_1.UserModel.create(phone, passwordHash, name, surname, age);
        const secret = process.env.JWT_SECRET || 'secret';
        const expiresIn = process.env.JWT_EXPIRES_IN || '1d';
        const token = jsonwebtoken_1.default.sign({ id: newUser.id, phone: newUser.phone_number, role: newUser.role }, secret, { expiresIn: expiresIn });
        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: newUser.id,
                phone: newUser.phone_number,
                name: newUser.name,
                surname: newUser.surname,
                role: newUser.role
            }
        });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.register = register;
const login = async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) {
            return res.status(400).json({ message: 'Phone and password are required' });
        }
        const user = await User_1.UserModel.findByPhone(phone);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const isMatch = await bcryptjs_1.default.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const secret = process.env.JWT_SECRET || 'secret';
        const expiresIn = process.env.JWT_EXPIRES_IN || '1d';
        const token = jsonwebtoken_1.default.sign({ id: user.id, phone: user.phone_number, role: user.role }, secret, { expiresIn: expiresIn });
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                phone: user.phone_number,
                name: user.name,
                surname: user.surname,
                role: user.role
            }
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.login = login;
