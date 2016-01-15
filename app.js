(function () {
  var PROJECT_STATUS_ACTIVE = 1;
  return {
    defaultState: 'loading',
    PROJECT_TO_USE: '1',
    TRACKERS: [],
    PROJECTS: [],
    appID: 'RedmineAPP_IntegrationV2',
    requests: {
      getAudit: function (id) {
        return {
          url: '/api/v2/tickets/' + id + '/audits.json',
          type: 'GET',
          contentType: 'application/json',
          dataType: 'json'
        };
      },
      updateTicket: function (id, data) {
        return {
          url: '/api/v2/tickets/' + id + '.json',
          type: 'PUT',
          data: data,
          dataType: 'json',
          contentType: 'application/json'
        };
      },
      postRedmine: function (project, redmine_url, data) {
        return {
          url: redmine_url + '/issues.json?key={{setting.apiKey}}',
          type: 'POST',
          dataType: 'json',
          data: data,
          secure: true
        };
      },
      getProjects: function (redmine_url) {
        return {
          url: redmine_url + '/projects.json?key={{setting.apiKey}}&limit=100',
          type: 'GET',
          dataType: 'json',
          secure: true
        };
      },
      getIssue: function (redmine_url, issue_id) {
        return {
          url: redmine_url + '/issues/' + issue_id + '.json?key={{setting.apiKey}}',
          type: 'GET',
          dataType: 'json',
          secure: true
        };
      },
      getTrackers: function (redmine_url) {
        return {
          url: redmine_url + '/projects/' + this.PROJECT_TO_USE + '.json?key={{setting.apiKey}}&include=trackers',
          type: 'GET',
          dataType: 'json',
          secure: true
        };
      },
      getMembers: function (redmine_url) {
        return {
          url: redmine_url + '/projects/' + this.PROJECT_TO_USE + '/memberships.json?key={{setting.apiKey}}&limit=100',
          type: 'GET',
          dataType: 'json',
          secure: true
        };
      }
    },
    events: {
      'app.activated': 'onActivated',
      'postRedmine.done': 'fn_result',
      'click #submitToRedmine': 'fn_prep_to_post',
      'getProjects.done': 'fn_listProjects',
      'getTrackers.done': 'fn_saveTrackers',
      'getMembers.done': 'fn_saveMembers',
      'getAudit.done': 'fn_listMeta',
      'click .project': 'fn_projectSelect',
      'updateTicket.done': 'fn_reset',
      'click .issue': 'fn_get_issue',
      'getIssue.done': 'fn_show_issue',
      'getIssue.fail': 'fn_show_issue_error',
      'click .back_button': 'onActivated'
    },
    fn_renderError: function (error_text) {
      services.notify(error_text, 'error');
      this.switchTo('error', {error: error_text});
    },
    onActivated: function () {
      this.switchTo('loading');
      this.doneLoading = false;
      this.loadIfDataReady();
    },
    loadIfDataReady: function () {
      if (!this.doneLoading && this.ticket().status() != null && this.ticket().requester().id()) {
        this.doneLoading = true;
        if (this.settings.redmine_url.search('\/$') != -1) {
          this.settings.redmine_url = this.settings.redmine_url.slice(0, -1);
        } else {
          this.ajax('getProjects', this.settings.redmine_url);
        }
      }
    },
    fn_result: function (result) {
      services.notify(this.I18n.t('issue.posted'));
      var id = result.issue.id;
      var data = {
        "ticket": {
          "comment": {"public": false, "value": "This ticket was pushed to Redmine\n\n" + this.settings.redmine_url + "/issues/" + id + "\n\n"},
          "metadata": {"pushed_to_redmine": true, "redmine_id": id}
        }
      };
      data = JSON.stringify(data);
      this.ajax('updateTicket', this.ticket().id(), data);
    },
    fn_listProjects: function (data) {
      if (data == null) {
        this.fn_renderError("No data returned. Please check your API key.");
      } else {

        // Only show active projects
        data.projects = data.projects.filter(function (project) {
          return project.status === PROJECT_STATUS_ACTIVE;
        }).sort(function (a, b) {
          if (a.name.toLowerCase() < b.name.toLowerCase()) return -1;
          if (a.name.toLowerCase() > b.name.toLowerCase()) return 1;
          return 0;
        });

        this.PROJECTS = data;

        this.switchTo('projectList', {project_data: data});
        this.ajax('getAudit', this.ticket().id());
      }
    },
    fn_prep_to_post: function () {
      var subject = this.$('#rm_subject').val();
      var tracker = this.$('#rm_tracker').val();
      var priority = this.$('#rm_priority').val();
      var assigned = this.$('#rm_assigned').val();
      if (subject.length < 1) {
        services.notify('You must include a subject.', 'error');
      } else {
        this.switchTo('loading');
        var ticket_desc = this.ticket().description();
        ticket_desc = ticket_desc.replace(/&/gim, '').replace(/</gim, '').replace(/>/gim, '').replace(/:/gim, '');
        var data = {
          "issue": {
            "subject": subject,
            "project_id": this.PROJECT_TO_USE,
            "tracker_id": tracker,
            "assigned_to_id": assigned,
            "description": "This issue was pushed from Zendesk to Redmine.\n---\n\nDescription:\n" + ticket_desc + "\n---\n\nAdditional Message from Zendesk\n---\n" + this.$('#rm_note').val() + "\n\nTicket URL: https://" + this.currentAccount().subdomain() + ".zendesk.com/tickets/" + this.ticket().id() + "\n\n"
          }
        };
        if (this.settings.customFields.length > 0 && this.isJsonString(this.settings.customFields)) {
          data.issue.custom_fields = JSON.parse(this.settings.customFields);
        }
        else {
          data.issue.custom_fields = [];
        }
        if (this.settings.customFieldsIssueId > 0) {
          data.issue.custom_fields.push(
            {"id": this.settings.customFieldsIssueId, "value": this.ticket().id()}
          );
        }
        //data.issue.custom_fields = JSON.parse('[{"value":"Zendesk","id":7},{"value":194,"id":13}]');
        this.ajax('postRedmine', this.settings.project, this.settings.redmine_url, JSON.parse(JSON.stringify(data)));
      }
    },
    fn_projectSelect: function (e) {
      this.switchTo('loading');
      this.PROJECT_TO_USE = e.target.id;
      this.MEMBERS = [];
      this.ajax('getTrackers', this.settings.redmine_url);
    },
    fn_saveTrackers: function (data) {
      this.TRACKERS = data.project;
      this.ajax('getMembers', this.settings.redmine_url);
      //this.switchTo('index', {track: this.TRACKERS, assign: this.MEMBERS});
    },
    fn_saveMembers: function (data) {
      var members = data.memberships;
      var solvers = [];
      var self = this;
      members.forEach(function (member) {
        var can_solve = false;
        member.roles.forEach(function (role) {
          if (role.id == self.settings.roleId) {
            can_solve = true;
          }
        });
        if (can_solve) {
          solvers.push(member);
        }
      });
      this.MEMBERS = solvers;

      if (this.MEMBERS.length > 0) {
        this.switchTo('index', {track: this.TRACKERS, assign: this.MEMBERS});
      }
      else {
        this.switchTo('error', {error: "No user found for assignment"});
      }

      //this.switchTo('index', {track: this.TRACKERS, assign: this.MEMBERS});
    },
    fn_listMeta: function (data) {
      var pushed_to_redmine = false;
      var redmine_id = 0;
      var redmine = false;
      var issue_list = [];
      for (var i = 0; i <= data.count; i++) {
        try {
          var redmine_meta = data.audits[i].metadata.custom;
          if (redmine_meta.pushed_to_redmine) {
            redmine = true;
            issue_list.push(redmine_meta.redmine_id);
          }
        } catch (err) {
        }
      }
      if (redmine) {
        this.switchTo('projectList', {project_data: this.PROJECTS, issue: issue_list});
      } else {
        this.switchTo('projectList', {project_data: this.PROJECTS, issue: []});
      }
    },
    fn_reset: function () {
      this.switchTo('loading');
      this.ajax('getProjects', this.settings.redmine_url);
    },
    fn_get_issue: function (e) {
      this.switchTo('loading');
      var issue_id = e.target.classList[1].replace("id_", "");
      this.ajax('getIssue', this.settings.redmine_url, issue_id);
    },
    fn_show_issue: function (data) {
      this.switchTo('show_issue', {issue: data.issue, url: this.settings.redmine_url + "/issues/" + data.issue.id});
    },
    fn_show_issue_error: function (data) {
      this.fn_renderError('Issue was not found!');
    },
    isJsonString: function (str) {
      try {
        JSON.parse(str);
      } catch (e) {
        return false;
      }
      return true;
    }
  };
}());    