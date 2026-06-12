const bcrypt = require('bcryptjs');

bcrypt.hash('Admin@123', 12)
  .then(hash => {
    console.log(hash);
  });