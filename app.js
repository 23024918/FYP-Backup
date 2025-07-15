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

const checkRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (req.session.user && allowedRoles.includes(req.session.user.roleid)) {
      return next();
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

      // Redirect based on roleid
      if (results[0].roleid === 1) {
        return res.redirect('/admin');
      } else if (results[0].roleid === 2) {
        return res.redirect('/lecturer');
      } else if (results[0].roleid === 3) {
        return res.redirect('/student');
      } else {
        return res.redirect('/');
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
  const sql = `
    SELECT p.*, s.name as project_status 
    FROM project p 
    LEFT JOIN status s ON p.status_statusid = s.statusid
  `;
  connection.query(sql, (error, results) => { 
    if (error) throw error; 
    res.render('lecturer', { 
      project: results,
      currentUser: req.session.user 
    }); 
  }); 
});

app.get('/student', checkAuthenticated, checkRole(3), (req, res) => {
  const sql = `
    SELECT p.*, s.name as project_status,
           CASE WHEN pm.accountid IS NOT NULL THEN 1 ELSE 0 END as is_member
    FROM project p 
    LEFT JOIN status s ON p.status_statusid = s.statusid
    LEFT JOIN project_members pm ON p.projectid = pm.projectid AND pm.accountid = ?
    WHERE p.status_statusid != '1'
  `;
  connection.query(sql, [req.session.user.accountid], (error, results) => { 
    if (error) throw error; 
    res.render('student', { 
      project: results,
      currentUser: req.session.user 
    }); 
  }); 
});

app.get('/admin', checkAuthenticated, checkRole(1), (req, res) => {
  const sql = `
    SELECT p.*, s.name as project_status 
    FROM project p 
    LEFT JOIN status s ON p.status_statusid = s.statusid
  `;
  connection.query(sql, (error, results) => { 
    if (error) throw error; 
    res.render('admin', { 
      project: results,
      currentUser: req.session.user 
    }); 
  }); 
});

app.get('/pending', checkAuthenticated, checkRole(1), (req, res) => {
  const sql = `
    SELECT p.*, s.name as project_status 
    FROM project p 
    LEFT JOIN status s ON p.status_statusid = s.statusid
  `;
  connection.query(sql, (error, results) => { 
    if (error) throw error; 
    res.render('pending', { 
      project: results,
      currentUser: req.session.user 
    }); 
  }); 
});

app.get('/search', checkAuthenticated, (req, res) => {
  const query = req.query.query;
  let sql = `
    SELECT p.*, s.name as project_status 
    FROM project p 
    LEFT JOIN status s ON p.status_statusid = s.statusid 
    WHERE p.project_title LIKE ?
  `;
  
  // Students cannot see pending projects
  if (req.session.user.roleid === 3) {
    sql += ` AND p.status_statusid != '1'`;
  }
  
  connection.query(sql, [`%${query}%`], (error, searchResults) => {
    if (error) return res.status(500).send('Error searching for ISLP');
    res.render('searchResults', { 
      query, 
      results: searchResults,
      currentUser: req.session.user 
    });
  });
});

app.get('/ISLP/:projectid', checkAuthenticated, (req, res) => {
  const projectid = req.params.projectid;

  const projectSql = `
    SELECT p.*, s.name as project_status 
    FROM project p 
    LEFT JOIN status s ON p.status_statusid = s.statusid 
    WHERE p.projectid = ?
  `;

  const postSql = `
    SELECT sub.*, acc.username, acc.roleid as author_roleid
    FROM submissions sub 
    JOIN account acc ON sub.accountid = acc.accountid 
    WHERE sub.projectid = ? 
    ORDER BY sub.submission_date DESC
  `;

  const membersSql = `
    SELECT pm.*, acc.username, acc.email, acc.roleid
    FROM project_members pm
    JOIN account acc ON pm.accountid = acc.accountid
    WHERE pm.projectid = ?
    ORDER BY acc.username
  `;

  connection.query(projectSql, [projectid], (err, projectResults) => {
    if (err || projectResults.length === 0) return res.status(500).send('Project not found');

    connection.query(postSql, [projectid], (err, postResults) => {
      if (err) return res.status(500).send('Error loading posts');
      
      connection.query(membersSql, [projectid], (err, memberResults) => {
        if (err) {
          console.error('Error loading members:', err);
          memberResults = []; // Continue without members if there's an error
        }
        
        // Get facilitator details - project_head now contains a single lecturer ID
        let facilitators = [];
        if (projectResults[0].project_head) {
          const lecturerId = projectResults[0].project_head;
          
          // Query database for facilitator details
          const facilitatorSql = `
            SELECT username, email, roleid
            FROM account
            WHERE accountid = ?
            ORDER BY username
          `;
          
          connection.query(facilitatorSql, [lecturerId], (facilitatorErr, facilitatorResults) => {
            if (!facilitatorErr && facilitatorResults.length > 0) {
              facilitators = facilitatorResults;
            } else {
              console.error('Error querying facilitator or facilitator not found:', facilitatorErr);
            }
            
            res.render('ISLP', { 
              project: projectResults[0], 
              posts: postResults, 
              members: memberResults,
              facilitators: facilitators,
              user: req.session.user 
            });
          });
          return; // Exit early since we're handling the response in the callback
        } else {
          console.log('No project_head data found');
        }
        
        res.render('ISLP', { 
          project: projectResults[0], 
          posts: postResults, 
          members: memberResults,
          facilitators: facilitators,
          user: req.session.user 
        });
      });
    });
  });
});



app.get('/addISLP', checkAuthenticated, checkRole(1, 2), (req, res) => {
  // Get lecturers for project head dropdown (role ID 2)
  const lecturersSql = 'SELECT accountid, username, email, roleid FROM account WHERE roleid = 2';
  // Get students for members dropdown (role ID 3)
  const studentsSql = 'SELECT accountid, username, email, roleid FROM account WHERE roleid = 3';
  // Get all status options
  const statusSql = 'SELECT statusid, name, description FROM status ORDER BY statusid';
  
  connection.query(lecturersSql, (lecturerError, lecturerResults) => {
    if (lecturerError) {
      console.error('Error fetching lecturers:', lecturerError);
      return res.status(500).send('Error fetching lecturers');
    }
    
    connection.query(studentsSql, (studentError, studentResults) => {
      if (studentError) {
        console.error('Error fetching students:', studentError);
        return res.status(500).send('Error fetching students');
      }
      
      connection.query(statusSql, (statusError, statusResults) => {
        if (statusError) {
          console.error('Error fetching status options:', statusError);
          return res.status(500).send('Error fetching status options');
        }
        
        res.render('addISLP', { 
          lecturers: lecturerResults,
          students: studentResults,
          statusOptions: statusResults,
          currentUser: req.session.user 
        });
      });
    });
  });
});

app.post('/addISLP', checkAuthenticated, checkRole(1, 2), (req, res) => {                         
  const { project_title, description, project_start, project_end, members, status_statusid } = req.body;
  
  // Current user automatically becomes the project head - no validation needed
  
  // Parse members JSON string
  let membersList = [];
  if (members && members.trim() !== '') {
    try {
      membersList = JSON.parse(members);
    } catch (error) {
      console.error('Error parsing members:', error);
      return res.status(400).send('Invalid members data');
    }
  }
  
  // Use the selected status directly
  insertProjectWithMembers(project_title, req.session.user.accountid, description, project_start, project_end, status_statusid, membersList, res, req.session.user);
});

// Helper function to insert project and members
function insertProjectWithMembers(project_title, project_head, description, project_start, project_end, statusId, membersList, res, user) {
  const sql = 'INSERT INTO project (project_title, project_head, description, project_start, project_end, status_statusid) VALUES (?, ?, ?, ?, ?, ?)';
  connection.query(sql, [project_title, project_head, description, project_start, project_end, statusId], (error, results) => {
    if (error) {
      console.error('Error adding project:', error);
      return res.status(500).send('Error adding project: ' + error.message);
    }
    
    const projectId = results.insertId;
    console.log('Project added successfully with ID:', projectId);
    
    // Insert members if any
    if (membersList && membersList.length > 0) {
      insertProjectMembers(projectId, membersList, res, user);
    } else {
      console.log('No members to add');
      const redirectPath = user.roleid === 1 ? '/admin' : '/lecturer';
      res.redirect(redirectPath);
    }
  });
}

// Helper function to insert project members
function insertProjectMembers(projectId, membersList, res, user) {
  // Create project_members table if it doesn't exist
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS project_members (
      id INT AUTO_INCREMENT PRIMARY KEY,
      projectid INT NOT NULL,
      accountid INT NOT NULL,
      added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (projectid) REFERENCES project(projectid) ON DELETE CASCADE,
      FOREIGN KEY (accountid) REFERENCES account(accountid) ON DELETE CASCADE,
      UNIQUE KEY unique_project_member (projectid, accountid)
    )
  `;
  
  connection.query(createTableSql, (createError) => {
    if (createError) {
      console.error('Error creating project_members table:', createError);
      return res.status(500).send('Error creating members table: ' + createError.message);
    }
    
    // Insert members
    const memberValues = membersList.map(member => [projectId, member.id]);
    const insertMembersSql = 'INSERT INTO project_members (projectid, accountid) VALUES ?';
    
    connection.query(insertMembersSql, [memberValues], (membersError) => {
      if (membersError) {
        console.error('Error adding project members:', membersError);
        return res.status(500).send('Error adding members: ' + membersError.message);
      }
      
      console.log('Project members added successfully');
      const redirectPath = user.roleid === 1 ? '/admin' : '/lecturer';
      res.redirect(redirectPath);
    });
  });
}

app.get('/editISLP/:projectid', checkAuthenticated, checkRole(1, 2), (req, res) => {
  const projectid = req.params.projectid;
  const projectSql = 'SELECT * FROM project WHERE projectid = ?';
  
  connection.query(projectSql, [projectid], (error, projectResults) => {
    if (error) return res.status(500).send('Error retrieving project by ID');
    if (projectResults.length === 0) return res.status(404).send('ISLP not found');
    
    // Check if the current user can edit this project
    const project = projectResults[0];
    const canEdit = req.session.user.roleid === 1 || // Admin can edit all
                    parseInt(project.project_head) === req.session.user.accountid; // Project head can edit
    
    if (!canEdit) {
      return res.status(403).send('Access denied. You can only edit projects you created.');
    }
    
    // Get lecturers for project head dropdown (role ID 2)
    const lecturersSql = 'SELECT accountid, username, email, roleid FROM account WHERE roleid = 2';
    // Get students for members dropdown (role ID 3)
    const studentsSql = 'SELECT accountid, username, email, roleid FROM account WHERE roleid = 3';
    // Get all status options
    const statusSql = 'SELECT statusid, name, description FROM status ORDER BY statusid';
    
    connection.query(lecturersSql, (lecturerError, lecturerResults) => {
      if (lecturerError) {
        console.error('Error fetching lecturers:', lecturerError);
        return res.status(500).send('Error fetching lecturers');
      }
      
      connection.query(studentsSql, (studentError, studentResults) => {
        if (studentError) {
          console.error('Error fetching students:', studentError);
          return res.status(500).send('Error fetching students');
        }
        
        connection.query(statusSql, (statusError, statusResults) => {
          if (statusError) {
            console.error('Error fetching status options:', statusError);
            return res.status(500).send('Error fetching status options');
          }
          
          // Get existing project members
          const membersSql = `
            SELECT pm.*, acc.username, acc.email, acc.roleid
            FROM project_members pm
            JOIN account acc ON pm.accountid = acc.accountid
            WHERE pm.projectid = ?
            ORDER BY acc.username
          `;
          
          connection.query(membersSql, [projectid], (membersError, membersResults) => {
            if (membersError) {
              console.error('Error loading members:', membersError);
              membersResults = []; // Continue without members if there's an error
            }
            
            res.render('editISLP', { 
              project: projectResults[0], 
              lecturers: lecturerResults,
              students: studentResults,
              existingMembers: membersResults,
              statusOptions: statusResults,
              currentUser: req.session.user 
            });
          });
        });
      });
    });
  });
});

app.post('/editISLP/:projectid', checkAuthenticated, checkRole(1, 2), (req, res) => {
  const projectid = req.params.projectid;
  
  // First check if the project exists and if the user has permission to edit it
  const checkOwnershipSql = 'SELECT project_head FROM project WHERE projectid = ?';
  connection.query(checkOwnershipSql, [projectid], (checkError, checkResults) => {
    if (checkError) return res.status(500).send('Error checking project ownership');
    if (checkResults.length === 0) return res.status(404).send('Project not found');
    
    // Check if the current user can edit this project
    const project = checkResults[0];
    const canEdit = req.session.user.roleid === 1 || // Admin can edit all
                    parseInt(project.project_head) === req.session.user.accountid; // Project head can edit
    
    if (!canEdit) {
      return res.status(403).send('Access denied. You can only edit projects you created.');
    }
    
    const { project_title, project_head, description, project_start, project_end, members, status_statusid } = req.body;

    // Preserve original project head - don't change ownership unless admin explicitly wants to
    const actualProjectHead = project.project_head; // Keep original owner

    // Parse members JSON string
    let membersList = [];
    if (members && members.trim() !== '') {
      try {
        membersList = JSON.parse(members);
      } catch (error) {
        console.error('Error parsing members:', error);
        return res.status(400).send('Invalid members data');
      }
    }

    const updateFields = { project_title, project_head: actualProjectHead, description, project_start, project_end, status_statusid };
    const fields = Object.keys(updateFields);
    const values = Object.values(updateFields);

    const sql = `UPDATE project SET ${fields.map(field => `${field} = ?`).join(', ')} WHERE projectid = ?`;
    values.push(projectid);

    connection.query(sql, values, (error, results) => {
      if (error) return res.status(500).send('Error updating project');
      
      // Update project members
      updateProjectMembers(projectid, membersList, res, req.session.user);
    });
  });
});

// Helper function to update project members
function updateProjectMembers(projectId, membersList, res, user) {
  // First, delete existing members
  const deleteSql = 'DELETE FROM project_members WHERE projectid = ?';
  
  connection.query(deleteSql, [projectId], (deleteError) => {
    if (deleteError) {
      console.error('Error deleting existing members:', deleteError);
      return res.status(500).send('Error updating members: ' + deleteError.message);
    }
    
    // Insert new members if any
    if (membersList && membersList.length > 0) {
      const memberValues = membersList.map(member => [projectId, member.id]);
      const insertMembersSql = 'INSERT INTO project_members (projectid, accountid) VALUES ?';
      
      connection.query(insertMembersSql, [memberValues], (membersError) => {
        if (membersError) {
          console.error('Error adding updated project members:', membersError);
          return res.status(500).send('Error updating members: ' + membersError.message);
        }
        
        console.log('Project members updated successfully');
        const redirectPath = user.roleid === 1 ? '/admin' : '/lecturer';
        res.redirect(redirectPath);
      });
    } else {
      console.log('No members to add during update');
      const redirectPath = user.roleid === 1 ? '/admin' : '/lecturer';
      res.redirect(redirectPath);
    }
  });
}

app.get('/deleteISLP/:projectid', checkAuthenticated, checkRole(1, 2), (req, res) => {
  const projectid = req.params.projectid;
  
  // First check if the project exists and if the user has permission to delete it
  const checkOwnershipSql = 'SELECT project_head FROM project WHERE projectid = ?';
  connection.query(checkOwnershipSql, [projectid], (checkError, checkResults) => {
    if (checkError) return res.status(500).send('Error checking project ownership');
    if (checkResults.length === 0) return res.status(404).send('Project not found');
    
    // Check if the current user can delete this project
    const project = checkResults[0];
    const canDelete = req.session.user.roleid === 1 || // Admin can delete all
                      parseInt(project.project_head) === req.session.user.accountid; // Project head can delete
    
    if (!canDelete) {
      return res.status(403).send('Access denied. You can only delete projects you created.');
    }
    
    const sql = 'DELETE FROM project WHERE projectid = ?';
    connection.query(sql, [projectid], (error, results) => {
      if (error) return res.status(500).send('Error deleting project');
      const redirectPath = req.session.user.roleid === 1 ? '/admin' : '/lecturer';
      res.redirect(redirectPath);
    });
  });
});

app.get('/contact', (req, res) => {
  res.render('contac');
});

app.get('/profile', checkAuthenticated, (req, res) => {
  res.render('profile', { user: req.session.user });
});

app.post('/updateProfile', checkAuthenticated, (req, res) => {
  const { username, email, phone, password } = req.body;
  const accountid = req.session.user.accountid;

  // Build update query dynamically based on provided fields
  let updateFields = [];
  let values = [];

  if (username) {
    updateFields.push('username = ?');
    values.push(username);
  }
  if (email) {
    updateFields.push('email = ?');
    values.push(email);
  }
  if (phone) {
    updateFields.push('phone = ?');
    values.push(phone);
  }
  if (password && password.trim() !== '') {
    updateFields.push('password = ?');
    values.push(password);
  }

  if (updateFields.length === 0) {
    return res.redirect('/profile');
  }

  values.push(accountid);
  const sql = `UPDATE account SET ${updateFields.join(', ')} WHERE accountid = ?`;

  connection.query(sql, values, (error, results) => {
    if (error) {
      console.error('Error updating profile:', error);
      return res.status(500).send('Error updating profile');
    }

    // Update session data
    connection.query('SELECT * FROM account WHERE accountid = ?', [accountid], (selectError, selectResults) => {
      if (selectError) {
        console.error('Error fetching updated user data:', selectError);
      } else if (selectResults.length > 0) {
        req.session.user = selectResults[0];
      }
      res.redirect('/profile');
    });
  });
});

app.post('/submit', (req, res) => {
  const { name, email, contact_no, comments } = req.body;
  const sql = 'INSERT INTO feedback (name, email, contact_no, comments) VALUES (?, ?, ?, ?)';
  connection.query(sql, [name, email, contact_no, comments], (error, results) => {
    if (error) return res.status(500).send('Error adding feedback');
    res.render('submit', { name, email, contact_no, comments });
  });
});

app.get('/feedback', checkAuthenticated, checkRole(1, 2), (req, res) => {
  // Get projects filtered by current user (only show projects they created/own)
  const sql = `
    SELECT p.*, s.name as project_status 
    FROM project p 
    LEFT JOIN status s ON p.status_statusid = s.statusid
    WHERE p.project_head = ?
    ORDER BY p.projectid DESC
  `;
  
  connection.query(sql, [req.session.user.accountid], (error, results) => {
    if (error) {
      console.error('Error fetching user projects:', error);
      return res.status(500).send('Error loading your projects');
    }
    res.render('myproject', { 
      projects: results,
      currentUser: req.session.user 
    });
  });
});

app.get('/myproject', checkAuthenticated, (req, res) => {
  if (req.session.user.roleid === 3) {
    // Student: Get projects where they are members, excluding pending projects
    const sql = `
      SELECT p.*, s.name as project_status 
      FROM project p 
      LEFT JOIN status s ON p.status_statusid = s.statusid
      INNER JOIN project_members pm ON p.projectid = pm.projectid
      WHERE pm.accountid = ? AND p.status_statusid != '1'
      ORDER BY p.projectid DESC
    `;
    
    connection.query(sql, [req.session.user.accountid], (error, results) => {
      if (error) {
        console.error('Error fetching student projects:', error);
        return res.status(500).send('Error loading your projects');
      }
      res.render('myproject', { 
        projects: results,
        currentUser: req.session.user 
      });
    });
  } else {
    // Lecturer/Admin: Get projects they created/own
    const sql = `
      SELECT p.*, s.name as project_status 
      FROM project p 
      LEFT JOIN status s ON p.status_statusid = s.statusid
      WHERE p.project_head = ?
      ORDER BY p.projectid DESC
    `;
    
    connection.query(sql, [req.session.user.accountid], (error, results) => {
      if (error) {
        console.error('Error fetching user projects:', error);
        return res.status(500).send('Error loading your projects');
      }
      res.render('myproject', { 
        projects: results,
        currentUser: req.session.user 
      });
    });
  }
});

app.get('/addPost/:projectid', checkAuthenticated, checkRole(1, 2, 3), (req, res) => {
  const { projectid } = req.params;
  
  // Get project details
  const projectSql = 'SELECT * FROM project WHERE projectid = ?';
  
  connection.query(projectSql, [projectid], (err, projectResults) => {
    if (err || projectResults.length === 0) return res.status(404).send('Project not found');
    
    const project = projectResults[0];
    
    // All authenticated users can add posts to any project
    res.render('addPost', { project: project });
  });
});

app.post('/addPost/:projectid', checkAuthenticated, checkRole(1, 2, 3), (req, res) => {
  const { projectid } = req.params;
  const { description } = req.body;
  
  // Get project details to verify it exists
  const projectSql = 'SELECT * FROM project WHERE projectid = ?';
  
  connection.query(projectSql, [projectid], (err, projectResults) => {
    if (err || projectResults.length === 0) return res.status(404).send('Project not found');
    
    // All authenticated users can add posts to any project
    const accountid = req.session.user.accountid;
    const sql = `INSERT INTO submissions (accountid, projectid, description, submission_date) VALUES (?, ?, ?, NOW())`;
    
    connection.query(sql, [accountid, projectid, description], (insertErr, result) => {
      if (insertErr) {
        console.error('Error inserting submission:', insertErr);
        return res.status(500).send('Failed to add submission');
      }
      res.redirect(`/ISLP/${projectid}`);
    });
  });
});

app.get('/editPost/:submissionsid', checkAuthenticated, checkRole(1, 2, 3), (req, res) => {
  const { submissionsid } = req.params;
  const sql = 'SELECT submissionsid, projectid, description, accountid FROM submissions WHERE submissionsid = ?';

  connection.query(sql, [submissionsid], (err, results) => {
    if (err || results.length === 0) return res.status(404).send('Post not found');
    
    const post = results[0];
    // All users (including admin) can only edit posts they created
    if (post.accountid !== req.session.user.accountid) {
      return res.status(403).send('Access denied. You can only edit posts you created.');
    }
    
    res.render('editPost', { post: post });
  });
});


app.post('/editPost/:submissionsid', checkAuthenticated, checkRole(1, 2, 3), (req, res) => {
  const { submissionsid } = req.params;
  const { description } = req.body;

  // First check if the post exists and if the user has permission to edit it
  const checkOwnershipSql = 'SELECT accountid, projectid FROM submissions WHERE submissionsid = ?';
  connection.query(checkOwnershipSql, [submissionsid], (checkErr, checkResults) => {
    if (checkErr || checkResults.length === 0) return res.status(404).send('Post not found');
    
    const post = checkResults[0];
    // All users (including admin) can only edit posts they created
    if (post.accountid !== req.session.user.accountid) {
      return res.status(403).send('Access denied. You can only edit posts you created.');
    }

    const sql = 'UPDATE submissions SET description = ? WHERE submissionsid = ?';
    connection.query(sql, [description, submissionsid], (err, result) => {
      if (err) return res.status(500).send('Failed to update post');
      res.redirect(`/ISLP/${post.projectid}`);
    });
  });
});

app.get('/deletePost/:submissionsid', checkAuthenticated, checkRole(1, 2, 3), (req, res) => {
  const { submissionsid } = req.params;

  // Get post details and check ownership
  const getPostSql = `
    SELECT s.projectid, s.accountid, a.roleid as post_author_role
    FROM submissions s
    JOIN account a ON s.accountid = a.accountid
    WHERE s.submissionsid = ?
  `;
  connection.query(getPostSql, [submissionsid], (err, results) => {
    if (err || results.length === 0) return res.status(404).send('Post not found');
    
    const post = results[0];
    
    // Check permissions based on user role
    if (req.session.user.roleid === 1) {
      // Admin can delete any post - no restrictions
    } else if (req.session.user.roleid === 3) {
      // Students can only delete their own posts
      if (post.accountid !== req.session.user.accountid) {
        return res.status(403).send('Access denied. Students can only delete posts they created.');
      }
    } else if (req.session.user.roleid === 2) {
      // Lecturers can delete their own posts OR student posts, but NOT other lecturer posts
      if (post.accountid !== req.session.user.accountid && post.post_author_role === 2) {
        return res.status(403).send('Access denied. Lecturers cannot delete posts created by other lecturers.');
      }
    }
    
    const projectid = post.projectid;

    const deleteSql = 'DELETE FROM submissions WHERE submissionsid = ?';
    connection.query(deleteSql, [submissionsid], (deleteErr) => {
      if (deleteErr) return res.status(500).send('Failed to delete post');
      res.redirect(`/ISLP/${projectid}`);
    });
  });
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}/login`));
