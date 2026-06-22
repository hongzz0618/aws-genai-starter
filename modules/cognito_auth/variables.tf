variable "name" {
  type = string
}

variable "password_minimum_length" {
  type    = number
  default = 12

  validation {
    condition     = var.password_minimum_length >= 8 && var.password_minimum_length <= 99
    error_message = "password_minimum_length must be between 8 and 99."
  }
}

variable "tags" {
  type    = map(string)
  default = {}
}
