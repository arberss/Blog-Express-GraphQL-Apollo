const path = require('path');
const fs = require('fs');

const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const multer = require('multer');

require('dotenv').config();

const { ApolloServer } = require('apollo-server-express');
const { graphqlUploadExpress } = require('graphql-upload');

const typeDefs = require('./graphqlApollo/schema');
const resolvers = require('./graphqlApollo/resolvers/resolvers');

const isAuth = require('./middlewares/isAuth');

const app = express();

app.use(bodyParser.json()); // application/json
app.use('/images', express.static(path.join(__dirname, 'images')));

app.use(isAuth);

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Methods',
    'OPTIONS, GET, POST, PUT, PATCH, DELETE'
  );
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use((error, req, res, next) => {
  console.log(error);
  const status = error.statusCode || 500;
  const message = error.message;
  const data = error.data;
  res.status(status).json({ message: message, data: data });
});

async function startApolloServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => ({ req }),
  });
  await server.start();
  app.use(graphqlUploadExpress());
  server.applyMiddleware({ app });

  try {
    await mongoose.connect(
      `${process.env.MONGO_CONNECT}`,
      { useNewUrlParser: true, useUnifiedTopology: true }
    );

    console.log('connected');
    app.listen(process.env.PORT);
    return { server, app };
  } catch (error) {
    console.log(error);
  }
}

startApolloServer();
