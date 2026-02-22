"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUsers = void 0;
const User_1 = require("../../models/postgres/User");
const getUsers = async (req, res) => {
    try {
        const users = await User_1.UserModel.findAll();
        res.status(200).json(users);
    }
    catch (error) {
        console.error('Get Users Error:', error);
        res.status(500).json({ message: 'Failed to fetch users' });
    }
};
exports.getUsers = getUsers;
