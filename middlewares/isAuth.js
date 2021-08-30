const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
    const authHeader = req.get('Authorization');
    if (!authHeader) {
        req.isAuth = false;
        return next();
      }
      const token = authHeader.split(' ')[1];
      let decodedToken;
      try {
        decodedToken = jwt.verify(token, `${process.env.LOGIN_TOKEN}`);
      } catch (err) {
        req.isAuth = false;
        return next();
      }
      if (!decodedToken) {
        req.isAuth = false;
        return next();
      }
      req.userId = decodedToken.userId;
      req.isAuth = true;
      req.role = decodedToken.role;
      next();
};