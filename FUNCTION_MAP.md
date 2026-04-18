# FUNCTION_MAP.md
Navigation index for `index.html`. One row per function — use line numbers to jump directly.
Last updated: 2026-04-18 (post developer-role test, Phase 1 complete).

---

## Auth & App Bootstrap

| Line | Function | Description |
|------|----------|-------------|
| 484 | `switchTab(tab)` | Toggles between Login and Sign Up auth tabs |
| 491 | `doLogin()` | Reads email/password, calls Supabase signInWithPassword |
| 504 | `doSignup()` | Reads signup fields, calls Supabase signUp with full_name/role/company metadata |
| 523 | `showAuthMsg(form,msg,type)` | Displays error or success message below an auth form |
| 529 | `doLogout()` | Signs out via Supabase, reloads page |
| 536 | `loadApp(user)` | Fetches profile from `profiles`, sets `currentProfile`, renders sidebar & app shell |

---

## Navigation, Permissions & Rendering

| Line | Function | Description |
|------|----------|-------------|
| 575 | `nav(page, el, opts)` | Sets `currentPage`, updates active nav item, calls `render()` |
| 585 | `can(action)` | Role-based permission check — returns true/false for approve/upload/raise/submit/manageUsers/manageSubs/submitMS/manageRegister |
| 597 | `render()` | Dispatcher — routes `currentPage` to the correct `render*()` function |
| 616 | `updateBadges()` | Updates red counter badges on nav items (submittals, IRs, NCRs, RFIs) |

---

## UI Helpers & Badge Renderers

| Line | Function | Description |
|------|----------|-------------|
| 631 | `cdeBadge(state)` | Returns HTML `<span>` for a CDE state badge (WIP/Shared/Published/Archived/Superseded) |
| 643 | `poiBadge(code)` | Returns HTML badge for drawing review code (A/B/C/D) |
| 659 | `corrTypeBadge(type)` | Returns HTML badge for correspondence type (Letter/Email/Memo/Notice) |
| 727 | `sbadge(s)` | Returns HTML status badge with colour for generic status strings |
| 3176 | `openModal(title, body, footer, wide)` | Opens the shared modal overlay with given title/body/footer HTML |
| 3184 | `closeModal()` | Hides the modal overlay |
| 3185 | `closeBg(e)` | Closes modal when clicking the backdrop |
| 3188 | `toast(msg, type)` | Shows a temporary toast notification (info/success/error) |
| 3197 | `isOverdue(dateStr)` | Returns true if a date string is in the past |
| 3201 | `overdueTag(dateStr)` | Returns an "Overdue" badge HTML if date is past, else empty string |

---

## Drawing Validation

| Line | Function | Description |
|------|----------|-------------|
| 671 | `validateDrawingNumber(num)` | Enforces 8-segment BS 1192 drawing number format; returns error string or null |
| 694 | `enforceRevisionScheme(currentStatus, revision)` | Blocks wrong revision scheme (numeric in WIP, alpha in Shared+); returns error or null |
| 705 | `cdeStepperHTML(currentState, drawingId)` | Renders the CDE state stepper bar with clickable advance buttons |
| 1455 | `updateDocNum()` | Live-updates the BS 1192 number preview in the new-drawing form from field values |
| 2602 | `checkRevScheme()` | Validates revision scheme on the new-drawing form and shows inline error |

---

## Dashboard

| Line | Function | Description |
|------|----------|-------------|
| 740 | `renderDash()` | Fetches all module data, renders KPI cards, pending action lists, overdue alerts, and drawing status chart |

---

## Method Statements

| Line | Function | Description |
|------|----------|-------------|
| 966 | `renderMS()` | Fetches and renders the Method Statements list; contractors see "Submit" button, approvers see "Review" |
| 994 | `viewMS(id)` | Fetches a single MS record and renders its detail view with review panel (if approver) |
| 1077 | `doReviewMS(id)` | Submits a review decision (Approved/Rejected) for a Method Statement |
| 1097 | `openNewMS()` | Opens the new Method Statement submission modal (contractor/subcontractor only) |
| 1126 | `doNewMS()` | Inserts a new Method Statement record into Supabase |

---

## Drawing Register — Bulk Import

| Line | Function | Description |
|------|----------|-------------|
| 1147 | `openBulkImport()` | Opens the CSV bulk import modal for drawings |
| 1176 | `downloadBulkTemplate()` | Downloads a pre-filled CSV template for bulk drawing import |
| 1196 | `handleBulkDrop(event)` | Handles drag-and-drop of a CSV file onto the bulk import modal |
| 1201 | `parseBulkCSV(event)` | Reads a CSV file input and parses rows into the staging table |
| 1242 | `doBulkImport()` | Inserts all staged bulk-import drawing rows into Supabase |

---

## Selection & Batch Actions

| Line | Function | Description |
|------|----------|-------------|
| 1266 | `toggleDrawSelect(id, cb)` | Toggles a single drawing's selection state and updates bulk bar |
| 1270 | `toggleSubSelect(id, cb)` | Toggles a single submittal's selection state and updates bulk bar |
| 1274 | `selectAllDrawings(cb)` | Selects or deselects all visible drawings |
| 1282 | `selectAllSubmittals(cb)` | Selects or deselects all visible submittals |
| 1290 | `updateDrawBulkBar()` | Refreshes the drawing bulk-action bar count and visibility |
| 1304 | `updateSubBulkBar()` | Refreshes the submittal bulk-action bar count and visibility |
| 1318 | `clearDrawSelection()` | Clears all drawing selections |
| 1324 | `clearSubSelection()` | Clears all submittal selections |
| 1330 | `batchDrawAction(action)` | UI trigger for batch drawing action (approve / advanceCDE); calls `doBatchDrawAction` |
| 1339 | `batchSubAction(action)` | UI trigger for batch submittal action (review); calls `doBatchSubAction` |
| 1348 | `doBatchDrawAction(action)` | Executes batch approve or CDE advance on selected drawings in Supabase |
| 1381 | `doBatchSubAction(action)` | Executes batch "Pending Review → Under Review" on selected submittals |

---

## Drawing Register

| Line | Function | Description |
|------|----------|-------------|
| 1401 | `renderDrawings()` | Fetches drawings, renders list with filters, CDE badges, and action buttons |
| 1467 | `advanceCDE(id, newState)` | Updates a drawing's `cde_state` to the next CDE stage in Supabase |
| 1487 | `logAudit(document_id, document_type, action)` | Inserts an audit trail entry for a document action |
| 1497 | `filtDraw(el, field, val)` | Filters the drawing list by a single field value |

---

## Generic Filters

| Line | Function | Description |
|------|----------|-------------|
| 1523 | `filt(el, page, field, val)` | Applies a filter chip to any list page and re-renders |
| 1531 | `filtIROverdue(el)` | Filters IR list to show only overdue items |
| 1535 | `filtNCROverdue(el)` | Filters NCR list to show only overdue items |
| 1539 | `filtRFIOverdue(el)` | Filters RFI list to show only overdue items |
| 1543 | `filtSubOverdue(el)` | Filters Submittals list to show only overdue items |

---

## Submittals

| Line | Function | Description |
|------|----------|-------------|
| 1549 | `renderSubmittals()` | Fetches submittals, renders list with status badges and Review/Resubmit action buttons |

---

## Inspection Requests

| Line | Function | Description |
|------|----------|-------------|
| 1611 | `renderInspections()` | Fetches IRs, renders list with SLA tags, Respond (approver) and Re-Inspect buttons |
| 1619 | `slaTag(row)` | (inner) Returns an SLA/overdue tag based on IR due date and status |

---

## NCRs

| Line | Function | Description |
|------|----------|-------------|
| 1669 | `renderNCRs()` | Fetches NCRs, renders list with age tags and workflow action buttons (CAP/Verify/Close) |
| 1681 | `ageTag(row)` | (inner) Returns an age badge showing days since NCR was opened |

---

## Subcontractors & Users

| Line | Function | Description |
|------|----------|-------------|
| 1732 | `renderSubcontractors()` | Fetches and renders the subcontractor company list |
| 1749 | `renderUsers()` | Fetches all profiles and renders the user management table with Change Role buttons |
| 1765 | `editUserRole(uid, currentRole, name)` | Opens a Change Role modal for a specific user |
| 1777 | `doChangeRole(uid)` | Saves the new role selection to Supabase `profiles` |

---

## Detail Views

| Line | Function | Description |
|------|----------|-------------|
| 1784 | `viewDraw(id)` | Fetches a drawing record and renders its full detail view (revisions, CDE stepper, review panel, audit trail) |
| 1900 | `viewSub(id)` | Fetches a submittal record and renders its detail view with checklist and comment thread |
| 1962 | `viewIR(id)` | Fetches an IR record and renders its detail view with inspection checklist and respond panel |
| 2045 | `viewNCR(id)` | Fetches an NCR record and renders its detail view with CAP workflow and close panel |
| 3301 | `viewRFI(id)` | Fetches an RFI record and renders its detail view with respond/close buttons and comments |
| 3381 | `viewTransmittal(id)` | Fetches a transmittal and renders its detail view with attached drawings and acknowledge button |
| 3474 | `viewCorrespondence(id)` | Fetches a correspondence record and renders its detail view with close button and audit trail |
| 3503 | `viewAuditTrail(documentType, recordId, label)` | Fetches audit log entries for a record and renders them in a modal |
| 3632 | `viewPunchItem(id)` | Fetches a punch list item and renders its detail view with update/close buttons |

---

## Drawing Actions

| Line | Function | Description |
|------|----------|-------------|
| 2130 | `voidDrawing(id, drawingNo)` | Confirms then marks a drawing as Void in Supabase |
| 2141 | `linkDrawings(id, drawingNo)` | Opens a modal to link related drawing numbers to a drawing |
| 2159 | `saveLinkDrawings(id)` | Saves the linked drawings array to Supabase |
| 2167 | `exportDrawingRegister()` | Exports all drawings to a CSV file download |
| 2201 | `approveDrawing(id)` | Sets drawing status to Approved and logs audit entry |

---

## Submittal Actions

| Line | Function | Description |
|------|----------|-------------|
| 2218 | `reviewSub(id)` | Opens the review modal for a submittal (approver only) |
| 2237 | `doReviewSub(id)` | Saves the review decision and status update for a submittal |
| 2898 | `resubmitSub(parentId)` | Opens a resubmission form for a "Revise & Resubmit" submittal |
| 2930 | `doResubmit(parentId, nextRev)` | Inserts the resubmission record and marks parent as superseded *(see also line 3774)* |
| 3752 | `createResubmission(parentId)` | Opens resubmission modal for submittal detail view context |
| 3774 | `doResubmit(parentId, revNo)` | Duplicate resubmit handler used from detail view context *(potential conflict with line 2930)* |

---

## Inspection Request Actions

| Line | Function | Description |
|------|----------|-------------|
| 2253 | `respondIR(id)` | Opens the IR response modal (approver only) |
| 2272 | `doRespondIR(id)` | Saves the IR response (Pass/Fail/Conditional) and status to Supabase |
| 2856 | `reInspect(parentId)` | Opens re-inspection form after a failed/rejected IR |
| 2878 | `doReInspect(parentId)` | Inserts re-inspection IR record and links to parent |

---

## NCR Actions

| Line | Function | Description |
|------|----------|-------------|
| 2286 | `doCloseNCR(id)` | Closes an NCR with a close-out comment (approver only) |
| 2764 | `submitCAP(id)` | Opens CAP submission modal for contractor on an Open NCR |
| 2792 | `doSubmitCAP(id)` | Saves CAP description and advances NCR to "CAP Submitted" |
| 2810 | `verifyCAP(id)` | Opens CAP verification modal for approver |
| 2831 | `doVerifyCAP(id)` | Saves verification and advances NCR to "CAP Verified" |
| 2844 | `doRejectCAP(id)` | Rejects the CAP and reverts NCR to "Open" |

---

## File Upload & Revisions

| Line | Function | Description |
|------|----------|-------------|
| 2303 | `uploadRev(id)` | Opens the new revision upload modal for a drawing |
| 2325 | `handleFileSelect(event, id)` | Handles file input selection for revision upload |
| 2329 | `handleDrop(event, id)` | Handles drag-and-drop of a file onto the upload zone |
| 2336 | `doUploadRev(id)` | Uploads the new revision file to Supabase Storage and inserts revision record |
| 2297 | `removeSub(id)` | Removes a subcontractor record from Supabase |

---

## New Record Forms (openNew dispatcher)

| Line | Function | Description |
|------|----------|-------------|
| 2378 | `openNew()` | Master "+" button dispatcher — opens the correct new-record modal based on `currentPage` |

---

## Create / Insert Functions

| Line | Function | Description |
|------|----------|-------------|
| 2610 | `doNewDraw()` | Validates and inserts a new drawing record with BS 1192 number and metadata |
| 2679 | `doNewSub()` | Inserts a new submittal record with discipline, revision, and file reference |
| 2700 | `doNewIR()` | Inserts a new inspection request with contractor, location, and trade fields |
| 2725 | `doNewNCR()` | Inserts a new NCR with description, trade, and location |
| 2751 | `doNewSubcontractor()` | Inserts a new subcontractor company record |

---

## Checklists

| Line | Function | Description |
|------|----------|-------------|
| 2960 | `openChecklistModal(irId, template)` | Opens an IR inspection checklist modal pre-populated from a template |
| 2985 | `setCK(irId, idx, val, btn)` | Sets a single checklist item value and updates button state |
| 2993 | `saveChecklist(irId, items)` | Saves the completed checklist items array to Supabase |

---

## Submittal Register

| Line | Function | Description |
|------|----------|-------------|
| 3009 | `renderSubmittalRegister()` | Fetches and renders the submittal register with add/delete actions |
| 3064 | `addRegisterItem()` | Opens the add-item modal for the submittal register |
| 3095 | `doAddRegisterItem()` | Inserts a new submittal register line item into Supabase |
| 3111 | `deleteRegisterItem(id)` | Deletes a register item after confirmation |
| 3118 | `importRegisterCSV()` | Opens the CSV import modal for bulk register item import |
| 3139 | `handleRegisterDrop(e)` | Handles drag-and-drop of a CSV onto the register import zone |
| 3143 | `parseRegisterCSV(e)` | Shim — calls `parseRegisterCSVFile` from file input change event |
| 3144 | `parseRegisterCSVFile(file)` | Parses a CSV file and stages rows for register import |
| 3160 | `doImportRegister()` | Bulk inserts staged register items into Supabase |

---

## Comments

| Line | Function | Description |
|------|----------|-------------|
| 3212 | `loadComments(recordType, recordId)` | Fetches comments for any record type/id from Supabase |
| 3217 | `commentThreadHTML(recordType, recordId, comments)` | Renders a comment thread with post form and existing comments |
| 3238 | `postComment(recordType, recordId)` | Inserts a new comment and refreshes the thread |

---

## RFIs

| Line | Function | Description |
|------|----------|-------------|
| 3266 | `renderRFIs()` | Fetches and renders RFI list with status badges and Respond button |
| 3332 | `respondRFI(id)` | Opens the RFI response modal (approver only) |
| 3343 | `doRespondRFI(id)` | Saves RFI response and advances status to "Responded" |
| 3356 | `closeRFI(id)` | Confirms and closes a Responded RFI |
| 3806 | `openNewRFI()` | Opens the new RFI creation modal |
| 3833 | `doNewRFI()` | Inserts a new RFI record into Supabase |

---

## Transmittals

| Line | Function | Description |
|------|----------|-------------|
| 3362 | `renderTransmittals()` | Fetches and renders the transmittal list |
| 3428 | `acknowledgeTransmittal(id)` | Records acknowledgement timestamp on a transmittal |
| 3851 | `openNewTransmittal()` | Opens the new transmittal creation modal with drawing selector |
| 3897 | `doNewTransmittal(drawCount)` | Inserts a new transmittal record with attached drawing references |

---

## Correspondence

| Line | Function | Description |
|------|----------|-------------|
| 3439 | `renderCorrespondence()` | Fetches and renders correspondence list with type badges |
| 3497 | `closeCorrespondence(id)` | Marks a correspondence item as Closed |
| 3523 | `openNewCorrespondence()` | Opens the new correspondence creation modal |
| 3574 | `doNewCorrespondence()` | Inserts a new correspondence record into Supabase |

---

## Punch List

| Line | Function | Description |
|------|----------|-------------|
| 3594 | `renderPunchList()` | Fetches and renders punch list items with status and location |
| 3674 | `updatePunchItem(id)` | Opens the update modal for a punch list item |
| 3685 | `closePunchItem(id)` | Marks a punch list item as Closed |
| 3690 | `openNewPunchItem()` | Opens the new punch list item creation modal |
| 3733 | `doNewPunchItem()` | Inserts a new punch list item into Supabase |

---

## Attachments

| Line | Function | Description |
|------|----------|-------------|
| 3922 | `loadAttachments(recordType, recordId)` | Fetches attachment records for any document from Supabase |
| 3929 | `formatFileSize(bytes)` | Formats a byte count into human-readable string (KB/MB) |
| 3936 | `fileIcon(type)` | Returns an emoji icon for a MIME type |
| 3947 | `attachmentSectionHTML(recordType, recordId, attachments)` | Renders the full attachment panel with upload zone and file list |
| 3977 | `handleAttDrop(event, recordType, recordId)` | Handles drag-and-drop file upload on an attachment zone |
| 3984 | `handleAttUpload(event, recordType, recordId)` | Handles file input change for attachment upload |
| 3989 | `uploadAttachments(files, recordType, recordId)` | Uploads files to Supabase Storage and inserts attachment records |
| 4033 | `downloadAttachment(path, name)` | Gets a signed URL and triggers download for an attachment |
| 4041 | `deleteAttachment(attId, path, recordType, recordId)` | Deletes attachment from Storage and DB, then refreshes the panel |
| 4056 | `stageFiles(fileList, stagingId)` | Adds files to a staging buffer for deferred upload |
| 4065 | `renderStagedFiles(stagingId)` | Renders the list of staged (not yet uploaded) files |
| 4080 | `removeStagedFile(stagingId, idx)` | Removes a file from the staging buffer |
| 4085 | `uploadStagedFiles(stagingId, recordType, recordId)` | Uploads all staged files for a record after form submission |

---

## Drawing Review Panel

| Line | Function | Description |
|------|----------|-------------|
| 4094 | `drawingReviewPanelHTML(drawingId)` | Renders the reviewer markup panel with review code selector and comment field |
| 4143 | `stageMarkup(event, drawingId)` | Handles file selection for markup/redline attachment on a drawing review |
| 4155 | `handleMarkupDrop(event, drawingId)` | Handles drag-and-drop of markup file onto the review panel |
| 4160 | `selectReviewCode(el, code, drawingId)` | Selects a review code (A/B/C/D) in the review panel UI |
| 4180 | `submitDrawingReview(drawingId)` | Saves the drawing review record with code, comments, and markup to Supabase |

---

## PDF Viewer

| Line | Function | Description |
|------|----------|-------------|
| 4258 | `initPdfViewer(viewerId, url, filename)` | Initialises a PDF.js viewer instance for a given URL |
| 4288 | `pdfRenderPage(viewerId)` | Renders the current page of a PDF viewer instance |
| 4333 | `pdfUpdateToolbar(viewerId)` | Refreshes page number and zoom controls in the PDF toolbar |
| 4346 | `pdfPrevPage(viewerId)` | Navigates to the previous page in a PDF viewer |
| 4350 | `pdfNextPage(viewerId)` | Navigates to the next page in a PDF viewer |
| 4354 | `pdfZoomIn(viewerId)` | Increases zoom level of a PDF viewer |
| 4358 | `pdfZoomOut(viewerId)` | Decreases zoom level of a PDF viewer |
| 4362 | `pdfFitWidth(viewerId)` | Fits the PDF page to the viewer container width |
| 4371 | `pdfFitPage(viewerId)` | Fits the full PDF page within the viewer container |
| 4397 | `viewAttachmentPDF(attId, filePath, fileName)` | Opens a PDF attachment in the full-screen PDF viewer modal |

---

## Print

| Line | Function | Description |
|------|----------|-------------|
| 4430 | `printDoc(elementId, filename)` | Opens a print-friendly view of a detail panel element |

---

## Known Issues (as of 2026-04-18)
- **Line 2930 vs 3774**: Two functions both named `doResubmit` — risk of one shadowing the other
- **Submittal Register page heading**: May display raw page key instead of "Submittal Register" title
