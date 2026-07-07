// Package httperr provides a small HTTP-status-aware error type that fox can
// render with the embedded status code.
package httperr

import "net/http"

// StatusError is an error carrying the HTTP status code that should be sent to
// the client.
type StatusError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Error implements the error interface.
func (e *StatusError) Error() string {
	return e.Message
}

// StatusCode reports the HTTP status the router should emit.
func (e *StatusError) StatusCode() int {
	return e.Code
}

// NewBadRequest returns a 400 StatusError carrying message.
func NewBadRequest(message string) *StatusError {
	return &StatusError{Code: http.StatusBadRequest, Message: message}
}

// NewRequestEntityTooLarge returns a 413 StatusError carrying message.
func NewRequestEntityTooLarge(message string) *StatusError {
	return &StatusError{Code: http.StatusRequestEntityTooLarge, Message: message}
}

// NewUnauthorized returns a 401 StatusError carrying message.
func NewUnauthorized(message string) *StatusError {
	return &StatusError{Code: http.StatusUnauthorized, Message: message}
}

// NewConflict returns a 409 StatusError carrying message.
func NewConflict(message string) *StatusError {
	return &StatusError{Code: http.StatusConflict, Message: message}
}

// NewServiceUnavailable returns a 503 StatusError carrying message.
func NewServiceUnavailable(message string) *StatusError {
	return &StatusError{Code: http.StatusServiceUnavailable, Message: message}
}

// NewInternalServerError returns a 500 StatusError carrying message.
func NewInternalServerError(message string) *StatusError {
	return &StatusError{Code: http.StatusInternalServerError, Message: message}
}

// NewNotFound returns a 404 StatusError carrying message.
func NewNotFound(message string) *StatusError {
	return &StatusError{Code: http.StatusNotFound, Message: message}
}
