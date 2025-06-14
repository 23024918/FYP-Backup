const express = require('express'); 
const mysql = require('mysql2');
const multer = require('multer'); 
const session = require('express-session');
const flash = require('connect-flash');
const app = express();

// Set up multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/images');
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage: storage });

// MySQL connection 
const connection = mysql.createConnection({ 
  host: 'localhost', 
  user: 'root', 
  password: '', 
  database: 'fyp' 
});
 
connection.connect((err) => { 
  if (err) { 
    console.error('Error connecting to MySQL:', err); 
    return; 
  } 
  console.log('Connected to MySQL database'); 
});

// View engine and middleware
app.set('view engine', 'ejs'); 
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

// Session and flash
app.use(session({
  secret: 'secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));
app.use(flash());

// Auth middleware
const checkAuthenticated = (req, res, next) => {
  if (req.session.user) return next();
  req.flash('error', 'Please log in to access this page');
  res.redirect('/login');
};

const checkRole = (requiredRoleId) => {
  return (req, res, next) => {
    if (req.session.user && req.session.user.roleid === requiredRoleId) {
      next();
    } else {
      req.flash('error', 'Access denied.');
      res.redirect('/login');
    }
  };
};

// Routes
app.get('/login', (req, res) => {
  res.render('login', {
    errors: req.flash('error'),
    messages: req.flash('success')
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    req.flash('error', 'All fields are required.');
    return res.redirect('/login');
  }

  const sql = 'SELECT * FROM account WHERE email = ? AND password = ?';
  connection.query(sql, [email, password], (err, results) => {
    if (err) {
      console.error('Login error:', err);
      return res.status(500).send('Server error during login');
    }

    if (results.length > 0) {
      req.session.user = results[0];
      req.flash('success', 'Login successful!');

      // 🔁 REDIRECT BASED ON ROLEID
      if (results[0].roleid === 1) {
        return res.redirect('/admin');
    } else if (results[0].roleid === 2) {
        return res.redirect('/lecturer');
    } else if (results[0].roleid === 3) {
        return res.redirect('/student');
    } else {
        return res.redirect('/'); // fallback
    }
    } else {
      req.flash('error', 'Invalid email or password.');
      res.redirect('/login');
    }
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/lecturer', checkAuthenticated, checkRole(2), (req, res) => { 
  connection.query('SELECT * FROM project', (error, results) => { 
    if (error) throw error; 
    res.render('lecturer', { project: results }); 
  }); 
});

app.get('/student', checkAuthenticated, checkRole(3), (req, res) => {
  res.render('studentDashboard'); // You must create this view
});

app.get('/admin', checkAuthenticated, checkRole(1), (req, res) => {
  res.render('adminPanel'); // You must create this view
});

app.get('/search', checkAuthenticated, (req, res) => {
  const query = req.query.query;
  connection.query('SELECT * FROM project WHERE project_title LIKE ?', [`%${query}%`], (error, searchResults) => {
    if (error) return res.status(500).send('Error searching for ISLP');
    res.render('searchResults', { query, results: searchResults });
  });
});

app.get('/ISLP/:projectid', checkAuthenticated, (req, res) => {
  const projectid = req.params.projectid;
  const sql = 'SELECT * FROM project WHERE projectid = ?';

  connection.query(sql, [projectid], (error, results) => {
    if (error) return res.status(500).send('Error retrieving project by ID');
    if (results.length > 0) {
      res.render('ISLP', { project: results[0] });
    } else {
      res.status(404).send('Project not found');
    }
  });
});

app.get('/addISLP', checkAuthenticated, checkRole(1,2), (req, res) => {
  res.render('addISLP');
});

app.post('/addISLP', checkAuthenticated, checkRole(1,2), (req, res) => {
  const { project_title, project_head, description, project_start, project_end } = req.body;
  const sql = 'INSERT INTO project (project_title, project_head, description, project_start, project_end) VALUES (?, ?, ?, ?, ?)';
  connection.query(sql, [project_title, project_head, description, project_start, project_end], (error, results) => {
    if (error) return res.status(500).send('Error adding project');
    res.redirect('/lecturer');
  });
});

app.get('/editISLP/:projectid', checkAuthenticated, checkRole(1,2), (req, res) => {
  const projectid = req.params.projectid;
  const sql = 'SELECT * FROM project WHERE projectid = ?';
  connection.query(sql, [projectid], (error, results) => {
    if (error) return res.status(500).send('Error retrieving project by ID');
    if (results.length > 0) {
      res.render('editISLP', { project: results[0] });
    } else {
      res.status(404).send('ISLP not found');
    }
  });
});

app.post('/editISLP/:projectid', checkAuthenticated, checkRole(1,2), (req, res) => {
  const projectid = req.params.projectid;
  const { project_title, project_head, description, project_start, project_end } = req.body;

  const updateFields = { project_title, project_head, description, project_start, project_end };
  const fields = Object.keys(updateFields);
  const values = Object.values(updateFields);

  const sql = `UPDATE project SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE projectid = ?`;
  values.push(projectid);

  connection.query(sql, values, (error, results) => {
    if (error) return res.status(500).send('Error updating project');
    res.redirect('/lecturer');
  });
});

app.get('/deleteISLP/:projectid', checkAuthenticated, checkRole(1,2), (req, res) => {
  const projectid = req.params.projectid;
  const sql = 'DELETE FROM project WHERE projectid = ?';
  connection.query(sql, [projectid], (error, results) => {
    if (error) return res.status(500).send('Error deleting project');
    res.redirect('/lecturer');
  });
});

app.get('/contact', (req, res) => {
  res.render('contac');
});

app.post('/submit', (req, res) => {
  const { name, email, contact_no, comments } = req.body;
  const sql = 'INSERT INTO feedback (name, email, contact_no, comments) VALUES (?, ?, ?, ?)';
  connection.query(sql, [name, email, contact_no, comments], (error, results) => {
    if (error) return res.status(500).send('Error adding feedback');
    res.render('submit', { name, email, contact_no, comments });
  });
});

app.get('/feedback', checkAuthenticated, checkRole(1), (req, res) => {
  connection.query('SELECT * FROM feedback', (error, results) => {
    if (error) throw error;
    res.render('feedbac', { feedback: results });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}/login`));