const {
  AuthenticationError,
  UserInputError,
} = require('apollo-server-express');

const { GraphQLUpload } = require('graphql-upload');

const bcrypt = require('bcryptjs');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
require('dotenv').config();

const User = require('../../models/user');
const Post = require('../../models/post');

const generateRandomString = require('../../utils/randomString');
const clearImage = require('../../utils/clearImage');

module.exports = {
  Upload: GraphQLUpload,

  Query: {
    currentUser: async function (_, args, context) {
      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const user = await User.findById(context.req.userId).select('-password');

      return {
        ...user._doc,
        _id: user._id.toString(),
      };
    },
    login: async function (_, { email, password }, context) {
      const user = await User.findOne({ email });
      if (!user) {
        const error = new Error('This user does not exist');
        error.status = 404;
        throw error;
      }
      const isEqual = await bcrypt.compare(password, user.password);
      if (!isEqual) {
        const error = new Error('Password is incorrect.');
        error.code = 401;
        throw error;
      }
      const token = jwt.sign(
        {
          userId: user._id.toString(),
          email: user.email,
          role: user.role,
        },
        `${process.env.LOGIN_TOKEN}`,
        { expiresIn: '1h' }
      );
      return { token, userId: user._id.toString() };
    },
    allUsers: async function (_, args, context) {
      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const users = await User.find().select('-password');

      return users.map((user) => {
        return {
          ...user._doc,
          _id: user._id.toString(),
        };
      });
    },
  },
  Mutation: {
    createUser: async (
      parent,
      { email, name, file, password, confirmPassword },
      context
    ) => {
      const { createReadStream, filename, mimetype, encoding } =
        await file.promise;

      const errors = [];
      if (!validator.isEmail(email)) {
        errors.push({ message: 'E-Mail is invalid.' });
      }
      if (validator.isEmpty(name)) {
        errors.push({ message: 'Name can not be empty!' });
      }
      if (
        validator.isEmpty(password) ||
        !validator.isLength(password, { min: 5 })
      ) {
        errors.push({ message: 'Password too short!' });
      }
      if (errors.length > 0) {
        const error = new Error('Invalid input.');
        error.data = errors;
        error.code = 422;
        throw error;
      }

      const randomName = generateRandomString(12) + filename;
      const stream = createReadStream();
      const pathName = path.join(__dirname, `../../images/${randomName}`);
      stream.pipe(fs.createWriteStream(pathName));

      const existingUser = await User.findOne({ email }).select('-password');
      if (existingUser) {
        const error = new Error('User exists already!');
        error.code = 409;
        throw error;
      }
      if (password !== confirmPassword) {
        const error = new Error('Password does NOT match!');
        throw error;
      }

      const hashedPw = await bcrypt.hash(password, 12);

      const user = new User({
        email,
        name,
        password: hashedPw,
        imageUrl: randomName,
      });
      const createdUser = await user.save();
      return {
        ...createdUser._doc,
        _id: createdUser._id.toString(),
      };
    },
    updateUser: async function (_, { userInput }, context) {
      const { email, name, file, password, confirmPassword } = userInput;
      const { createReadStream, filename, mimetype, encoding } =
        await file.promise;

      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const errors = [];
      if (!validator.isEmail(email)) {
        errors.push({ message: 'E-Mail is invalid.' });
      }
      if (validator.isEmpty(name)) {
        errors.push({ message: 'Name can not be empty!' });
      }
      if (
        validator.isEmpty(password) ||
        !validator.isLength(password, { min: 5 })
      ) {
        errors.push({ message: 'Password too short!' });
      }
      if (errors.length > 0) {
        const error = new Error('Invalid input.');
        error.data = errors;
        error.code = 422;
        throw error;
      }

      if (password !== confirmPassword) {
        const error = new Error('Password does NOT match!');
        throw error;
      }
      const hashedPw = await bcrypt.hash(password, 12);

      const findUser = await User.findById(context.req.userId).select(
        '_id imageUrl'
      );

      if (findUser.imageUrl) {
        clearImage(findUser.imageUrl);
      }

      const randomName = generateRandomString(12) + filename;
      const stream = createReadStream();
      const pathName = path.join(__dirname, `../../images/${randomName}`);
      stream.pipe(fs.createWriteStream(pathName));

      const userData = {
        email,
        name,
        password: hashedPw,
        imageUrl: randomName,
      };

      let user = await User.findOneAndUpdate(
        { _id: context.req.userId },
        { $set: userData },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).populate('posts');

      return {
        ...user._doc,
        _id: user._id.toString(),
        name: user.name.toString(),
        email: user.email.toString(),
        posts: user.posts,
      };
    },
    adminUpdateRoles: async function (_, { userId, role }, context) {
      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      if (context.req.role.toLowerCase() === 'admin') {
        const newRole = await User.findByIdAndUpdate(
          { _id: userId },
          { $set: { role: role.toUpperCase() } },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        return {
          userId: newRole._id.toString(),
          role: newRole.role.toString(),
        };
      }

      const error = new Error('Not authorized!');
      error.code = 401;
      throw error;
    },
    updateUserRole: async function (_, { role }, context) {
      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const newRole = await User.findByIdAndUpdate(
        { _id: context.req.userId },
        { $set: { role: role.toUpperCase() } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      return {
        userId: newRole._id.toString(),
        role: newRole.role,
      };
    },
    deleteUser: async function (_, { id }, context) {
      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      if (context.req.role.toLowerCase() === 'admin') {
        await Promise.all([
          Post.deleteMany({ creator: { _id: id } }),
          User.findByIdAndDelete(id),
        ]);
        return id;
      } else {
        const user = await User.findById(id);
        if (user._id.toString() !== context.req.userId.toString()) {
          const error = new Error('Not authorized!');
          error.code = 401;
          throw error;
        }

        await Promise.all([
          Post.deleteMany({ creator: { _id: id } }),
          User.findByIdAndDelete(id),
        ]);
        return id;
      }
    },
    forgotPassword: async function (_, { email }, context) {
      const user = await User.findOne({ email });
      if (!user) {
        const error = new Error('This user does not exist');
        error.status = 404;
        throw error;
      }

      const token = jwt.sign(
        {
          userId: user._id.toString(),
          email: user.email,
        },
        `${process.env.FORGOT_EMAIL_SECRET}`,
        { expiresIn: 60 * 15 }
      );

      const expiresDate = new Date() * 60 * 15;

      user.passwordResetToken = token;
      user.passwordResetExpires = expiresDate.valueOf().toString();
      await user.save();

      // create reusable transporter object using the default SMTP transport
    let transporter = nodemailer.createTransport({
      host: 'smtp-mail.outlook.com',
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: `${process.env.SEND_MAIL_USER}`,
        pass: `${process.env.SEND_MAIL_PASS}`, 
      },
    });

    // send mail with defined transport object
    let info = await transporter.sendMail({
      from: 'BlogExpress', // sender address
      to: email, // list of receivers
      subject: 'Reset Password - BlogExpress', // Subject line
      text: `Blog Express`, // plain text body
      html: `<h1>Link:</h1> http://localhost:8080/api/user/reset-password/${token}`, // html body
    });

      return email.toString();
    },
    resetPassword: async function (
      _,
      { token, password, confirmPassword },
      context
    ) {
      const decodedToken = jwt.verify(token, `${process.env.FORGOT_EMAIL_SECRET}`);
      if (!decodedToken) {
        const error = new Error('Token is invalid or has expired!');
        error.status = 400;
        throw error;
      }

      const user = await User.findOne({
        passwordResetToken: token,
        passwordResetExpires: { $gt: new Date().valueOf().toString() },
      });
      if (!user) {
        const error = new Error('Token is invalid or has expired!');
        error.status = 400;
        throw error;
      }

      if (password !== confirmPassword) {
        const error = new Error('Password does NOT match!');
        throw error;
      }

      const hashedPw = await bcrypt.hash(password, 12);

      user.password = hashedPw;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      return user.email.toString();
    },
  },
};
