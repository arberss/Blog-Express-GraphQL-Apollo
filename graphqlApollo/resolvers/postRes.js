const {
  AuthenticationError,
  UserInputError,
} = require('apollo-server-express');

const { GraphQLUpload } = require('graphql-upload');

const mongoose = require('mongoose');
const validator = require('validator');

const User = require('../../models/user');
const Post = require('../../models/post');

const generateRandomString= require('../../utils/randomString');
const clearImage= require('../../utils/clearImage');

module.exports = {
  Upload: GraphQLUpload,

  Query: {
    getPublicPosts: async function (parent, args, context) {
      const posts = await Post.find(
        { postStatus: 'public' } || { postStatus: 'PUBLIC' } || {
            postStatus: 'Public',
          }
      ).populate('creator', '-password');
      if (!posts) {
        const error = new Error('No post founded!');
        error.code = 404;
        throw error;
      }

      const newPost = posts.map((p) => {
        return {
          ...p._doc,
          _id: p._id.toString(),
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        };
      });

      return newPost;
    },
    getAllPosts: async function (_, args, context) {
      const posts = await Post.find().populate('creator', '-password');
      if (!posts) {
        const error = new Error('No post founded!');
        error.code = 404;
        throw error;
      }

      if (!context.req.isAuth) {
        const error = new Error('You do not have access to all posts!');
        error.code = 401;
        throw error;
      }

      if (context.req.role.toLowerCase() !== 'admin') {
        const error = new Error('You do not have permission to all posts!');
        error.code = 401;
        throw error;
      }

      const newPost = posts.map((p) => {
        return {
          ...p._doc,
          _id: p._id.toString(),
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        };
      });

      return newPost;
    },
    getPublicPosts: async function (_, args, context) {
      const posts = await Post.find(
        { postStatus: 'public' } || { postStatus: 'PUBLIC' } || {
            postStatus: 'Public',
          }
      ).populate('creator', '-password');
      if (!posts) {
        const error = new Error('No post founded!');
        error.code = 404;
        throw error;
      }

      const newPost = posts.map((p) => {
        return {
          ...p._doc,
          _id: p._id.toString(),
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        };
      });

      return newPost;
    },
    getPrivatePosts: async function (_, args, context) {
      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const user = await User.findById(context.req.userId)
        .select('-password')
        .populate('posts');

      if (!user.posts) {
        const error = new Error('No post founded!');
        error.code = 404;
        throw error;
      }

      return user.posts.map((p) => {
        return {
          ...p._doc,
          _id: p._id.toString(),
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        };
      });
    },
    getPost: async function (_, { id }, context) {
      const post = await Post.findById(id).populate('creator', 'name email');
      if (!post) {
        const error = new Error('No post founded!');
        error.code = 404;
        throw error;
      }
      if (post.postStatus === 'private' && !context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      return {
        ...post,
        _id: post._id.toString(),
        title: post.title.toString(),
        content: post.content.toString(),
        postStatus: post.postStatus.toString(),
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        creator: {
          _id: post.creator._id.toString(),
          name: post.creator.name.toString(),
          email: post.creator.email.toString(),
        },
      };
    },
  },
  Mutation: {
    createPost: async function (_, { postInput }, context) {
      const { title, file, content, postStatus } = postInput;

      const { createReadStream, filename, mimetype, encoding } =
        await file.promise;

      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const errors = [];
      if (
        validator.isEmpty(title) ||
        validator.isEmpty(content) ||
        validator.isEmpty(postStatus)
      ) {
        errors.push({ message: 'Please fill all inputs!' });
      }
      if (errors.length > 0) {
        const error = new Error('Invalid input.');
        error.data = errors;
        error.code = 422;
        throw error;
      }

      const user = await User.findById(context.req.userId).select('-password');

      if (!user) {
        const error = new Error('Invalid user.');
        error.code = 401;
        throw error;
      }

      const randomName = generateRandomString(12) + filename;
      const stream = createReadStream();
      const pathName = path.join(__dirname, `../../images/${randomName}`);
      stream.pipe(fs.createWriteStream(pathName));

      const post = new Post({
        title,
        content,
        postStatus,
        creator: user,
        imageUrl: randomName,
      });
      const createdPost = await post.save();
      user.posts.push(createdPost);
      await user.save();
      return {
        ...createdPost._doc,
        _id: createdPost._id.toString(),
        createdAt: createdPost.createdAt.toISOString(),
        updatedAt: createdPost.updatedAt.toISOString(),
      };
    },
    updatePost: async function (_, { postInput, id }, context) {
      const { title, file, content, postStatus } = postInput;
      const { createReadStream, filename, mimetype, encoding } =
        await file.promise;

      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const errors = [];
      if (
        validator.isEmpty(title) ||
        validator.isEmpty(content) ||
        validator.isEmpty(postStatus)
      ) {
        errors.push({ message: 'Please fill all inputs!' });
      }
      if (errors.length > 0) {
        const error = new Error('Invalid input.');
        error.data = errors;
        error.code = 422;
        throw error;
      }

      const findPost = await Post.findById(id)
        .select('_id imageUrl')
        .populate('creator', '_id');
      const user = await User.findById(context.req.userId).select('-password');
      if (!user) {
        const error = new Error('Invalid user.');
        error.code = 401;
        throw error;
      }

      if (findPost.creator._id.toString() !== context.req.userId.toString()) {
        const error = new Error('You do NOT have access to update this post!');
        error.code = 401;
        throw error;
      }

      if (findPost.imageUrl) {
        clearImage(findPost.imageUrl);
      }

      const randomName = generateRandomString(12) + filename;
      const stream = createReadStream();
      const pathName = path.join(__dirname, `../../images/${randomName}`);
      stream.pipe(fs.createWriteStream(pathName));

      const postData = {
        title,
        content,
        postStatus,
        creator: user,
        imageUrl: randomName,
      };

      let post = await Post.findOneAndUpdate(
        { _id: id },
        { $set: postData },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      ).populate('creator', '_id');

      user.posts.pull(id);
      user.posts.push(post);
      await user.save();
      return {
        ...post._doc,
        _id: post._id.toString(),
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        creator: {
          _id: user._id.toString(),
          name: user.name.toString(),
          email: user.email.toString(),
          role: user.role.toString(),
        },
      };
    },
    deletePost: async function (_, { id }, context) {
      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const post = await Post.findById(id).populate('creator', '_id');

      if (context.req.role.toLowerCase() === 'admin') {
        const user = await User.findById(post.creator._id).populate('posts');
        user.posts.pull(id);
        await user.save();
        await Post.findByIdAndDelete(id);
        return id;
      } else {
        const user = await User.findById(context.req.userId).populate('posts');
        if (post.creator._id.toString() !== context.req.userId.toString()) {
          const error = new Error('Not authorized!');
          error.code = 401;
          throw error;
        }
        user.posts.pull(id);
        await user.save();
        await Post.findByIdAndDelete(id);
        return id;
      }
    },
    updatePostStatus: async function (_, { id, status }, context) {
      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const post = await Post.findById(id).populate('creator', '_id');

      if (post.creator._id.toString() !== context.req.userId.toString()) {
        const error = new Error('Not authorized!');
        error.code = 401;
        throw error;
      }

      await Post.findOneAndUpdate(
        { _id: id },
        { $set: { postStatus: status } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      return {
        postId: id.toString(),
        status: status.toString(),
      };
    },
    addComment: async function (_, { commentInput }, context) {
      const { postId, text } = commentInput;

      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const post = await Post.findById(postId).populate('creator', '_id');
      if (!post) {
        const error = new Error('Post does not exist!');
        error.code = 404;
        throw error;
      }

      const commentId = new mongoose.Types.ObjectId();

      post.comments.push({ _id: commentId, user: context.req.userId, text });
      await post.save();

      return {
        _id: commentId.toString(),
        userId: context.req.userId.toString(),
        postId: postId.toString(),
        text: text.toString(),
      };
    },
    deleteComment: async function (_, { postId, commentId }, context) {
      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const post = await Post.findById(postId).populate('creator', '_id');
      if (!post) {
        const error = new Error('Post does not exist!');
        error.code = 404;
        throw error;
      }

      const findComment = post.comments.find(
        (comment) => comment._id.toString() === commentId.toString()
      );
      if (!findComment) {
        const error = new Error('This comment does not exist!');
        error.code = 404;
        throw error;
      }

      if (findComment.user.toString() !== context.req.userId.toString()) {
        const error = new Error('Not authorized.');
        error.code = 400;
        throw error;
      }

      post.comments.pull(commentId);
      await post.save();

      return {
        postId: postId.toString(),
        commentId: commentId.toString(),
      };
    },
    likePost: async function (_, { postId }, context) {
      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const post = await Post.findById(postId).populate('creator', '_id');
      if (!post) {
        const error = new Error('Post does not exist!');
        error.code = 404;
        throw error;
      }

      const checkIfLiked = post.likes.find(
        (p) => p.user.toString() === context.req.userId.toString()
      );
      const checkIfUnliked = post.unlikes.find(
        (p) => p.user.toString() === context.req.userId.toString()
      );

      if (checkIfLiked && (checkIfLiked.user.toString() !== context.req.userId.toString())) {
        const error = new Error('Not authorized.');
        error.code = 400;
        throw error;
      }

      // if is not liked
      if (!checkIfLiked) {
        const likeId = new mongoose.Types.ObjectId();
        if (checkIfUnliked) {
          await Post.findOneAndUpdate(
            { _id: postId },
            { $pull: { unlikes: { user: context.req.userId } } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
          );
        }
        post.likes.push({ _id: likeId, user: context.req.userId });
        await post.save();
        return {
          _id: likeId.toString(),
          postId: postId.toString(),
        };
      } else {
        // if is liked
        post.likes.pull(checkIfLiked._id);
        await post.save();
        return {
          _id: checkIfLiked._id.toString(),
          postId: postId.toString(),
        };
      }
    },
    unlikePost: async function (_, { postId }, context) {
      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const post = await Post.findById(postId).populate('creator', '_id');
      if (!post) {
        const error = new Error('Post does not exist!');
        error.code = 404;
        throw error;
      }

      const checkIfLiked = post.likes.find(
        (p) => p.user.toString() === context.req.userId.toString()
      );
      const checkIfUnliked = post.unlikes.find(
        (p) => p.user.toString() === context.req.userId.toString()
      );

      if (checkIfUnliked && (checkIfUnliked.user.toString() !== context.req.userId.toString())) {
        const error = new Error('Not authorized.');
        error.code = 400;
        throw error;
      }

      // if is not unliked
      if (!checkIfUnliked) {
        const unlikeId = new mongoose.Types.ObjectId();
        if (checkIfLiked) {
          await Post.findOneAndUpdate(
            { _id: postId },
            { $pull: { likes: { user: context.req.userId } } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
          );
        }
        post.unlikes.push({ _id: unlikeId, user: context.req.userId });
        await post.save();
        return {
          _id: unlikeId.toString(),
          postId: postId.toString(),
        };
      } else {
        // if is unliked
        post.unlikes.pull(checkIfUnliked._id);
        await post.save();
        return {
          _id: checkIfUnliked._id.toString(),
          postId: postId.toString(),
        };
      }
    },
    favoritePost: async function (_, { postId }, context) {
      if (!context.req.isAuth) {
        const error = new Error('Not authenticated!');
        error.code = 401;
        throw error;
      }

      const user = await User.findById(context.req.userId);
      if (!user) {
        const error = new Error('User does not exist!');
        error.code = 404;
        throw error;
      }

      if (user.favorites.toString().includes(postId.toString())) {
        user.favorites = user.favorites.filter((p) => p.toString() !== postId);
      } else {
        user.favorites.push(postId);
      }

      await user.save();

      return postId.toString();
    },
  },
};
