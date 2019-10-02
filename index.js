module.exports = {
  rules: {
    "check-types": {
      create: function (context) {
        return require("./check-types").create(context);
      }
    }
  }
};
